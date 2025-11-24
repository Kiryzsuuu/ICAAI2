import os
import uuid
import logging
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import json
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
from PyPDF2 import PdfReader
from openai import OpenAI
import math
import numpy as np
import tempfile
import time

# Initialize OpenAI client
client = None
api_key = os.getenv('OPENAI_API_KEY')
if api_key:
    client = OpenAI(api_key=api_key)

# Optional integrations
try:
    import pinecone
    _PINECONE_AVAILABLE = True
except Exception:
    pinecone = None
    _PINECONE_AVAILABLE = False

try:
    import pyttsx3
    _PYTTSX3_AVAILABLE = True
except Exception:
    pyttsx3 = None
    _PYTTSX3_AVAILABLE = False

# Try to import faiss; if unavailable, we'll fall back to JSON scoring
try:
    import faiss
    _FAISS_AVAILABLE = True
except Exception:
    faiss = None
    _FAISS_AVAILABLE = False
# Email functionality removed for simplicity

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("call-agent-api")

app = FastAPI(title="Interactive Call Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Storage paths
PDF_TEXT_PATH = "pdf_text_cache.txt"
PDF_STORAGE_DIR = "uploaded_pdfs"
CALL_LOGS_DIR = "call_logs"
EMBEDDINGS_PATH = "embeddings.json"
FAISS_INDEX_PATH = "embeddings.index"
EMBEDDINGS_META_PATH = "embeddings_meta.json"
USER_PREFS_PATH = "user_prefs.json"

# Create directories
for directory in [PDF_STORAGE_DIR, CALL_LOGS_DIR]:
    os.makedirs(directory, exist_ok=True)

# Models
class CallLogRequest(BaseModel):
    session_id: str
    participant_type: str
    message: str
    timestamp: str
    status: str = "active"

class SelectPdfRequest(BaseModel):
    pdf_id: str

class OrderConfirmationRequest(BaseModel):
    session_id: str
    customer_name: str
    customer_phone: str
    customer_email: str = None
    delivery_address: str
    order_items: list
    total_amount: float
    notes: str = None

class StaffTakeoverRequest(BaseModel):
    session_id: str
    message: str

# PDF Management
@app.post("/upload-pdf")
async def upload_pdf(file: UploadFile = File(...)):
    if file.content_type != "application/pdf":
        return JSONResponse(status_code=400, content={"error": "File harus PDF"})
    
    contents = await file.read()
    unique_name = f"{uuid.uuid4()}_{file.filename}"
    pdf_path = os.path.join(PDF_STORAGE_DIR, unique_name)
    
    with open(pdf_path, "wb") as f:
        f.write(contents)
    
    try:
        # Extract text from PDF
        reader = PdfReader(pdf_path)
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
        logger.info(f"Extracted text: {len(text)} characters")
        
        # Use text extraction only
        full_text = text
        with open(PDF_TEXT_PATH, "w", encoding="utf-8") as f:
            f.write(full_text)
        # After saving PDF text, optionally build embeddings if OPENAI_API_KEY is available
        try:
            if os.getenv('OPENAI_API_KEY'):
                build_embeddings_for_text(full_text)
        except Exception as e:
            logger.warning(f"Embedding build skipped/failed: {e}")
        
        logger.info("PDF processed successfully")
        return {"success": True, "pdf_path": pdf_path}
        
    except Exception as e:
        logger.error(f"PDF processing error: {e}")
        if os.path.exists(pdf_path):
            os.remove(pdf_path)
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/pdf-text")
def get_pdf_text():
    if not os.path.exists(PDF_TEXT_PATH):
        return {"text": ""}
    with open(PDF_TEXT_PATH, "r", encoding="utf-8") as f:
        text = f.read()
    return {"text": text}

# Global variable to track selected PDF
SELECTED_PDF_ID = None

@app.get("/list-pdfs")
def list_pdfs():
    if not os.path.exists(PDF_STORAGE_DIR):
        return {"pdfs": []}
    
    pdf_files = []
    for filename in os.listdir(PDF_STORAGE_DIR):
        if filename.endswith('.pdf'):
            file_path = os.path.join(PDF_STORAGE_DIR, filename)
            original_name = filename.split('_', 1)[1] if '_' in filename else filename
            pdf_files.append({
                "id": filename,
                "filename": original_name,
                "name": original_name,
                "path": file_path,
                "size": os.path.getsize(file_path),
                "selected": filename == SELECTED_PDF_ID
            })
    
    return {"pdfs": pdf_files}

@app.post("/select-pdf")
async def select_pdf(request: SelectPdfRequest):
    global SELECTED_PDF_ID
    pdf_path = os.path.join(PDF_STORAGE_DIR, request.pdf_id)
    
    if not os.path.exists(pdf_path):
        return JSONResponse(status_code=404, content={"error": "PDF tidak ditemukan"})
    
    try:
        reader = PdfReader(pdf_path)
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
        
        # Use text extraction only
        full_text = text
        
        with open(PDF_TEXT_PATH, "w", encoding="utf-8") as f:
            f.write(full_text)
        # Build embeddings for selected PDF so server-side retrieval is available
        try:
            if os.getenv('OPENAI_API_KEY'):
                build_embeddings_for_text(full_text)
        except Exception as e:
            logger.warning(f"Embedding build skipped/failed: {e}")
        
        # Update selected PDF ID
        SELECTED_PDF_ID = request.pdf_id
        
        logger.info(f"Selected PDF: {request.pdf_id}, extracted {len(full_text)} characters")
        return {"success": True, "message": "PDF berhasil dipilih", "text_length": len(full_text)}
        
    except Exception as e:
        logger.error(f"Error selecting PDF: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

# Call Logging
@app.post("/log-conversation")
async def log_conversation(request: CallLogRequest):
    log_file = os.path.join(CALL_LOGS_DIR, f"{request.session_id}.json")
    
    if os.path.exists(log_file):
        with open(log_file, "r", encoding="utf-8") as f:
            log_data = json.load(f)
    else:
        log_data = {
            "session_id": request.session_id,
            "start_time": request.timestamp,
            "messages": [],
            "order_status": "none",
            "session_stats": {
                "total_messages": 0,
                "keywords_detected": []
            }
        }
    
    log_data["messages"].append({
        "type": request.participant_type,
        "message": request.message,
        "timestamp": request.timestamp
    })
    
    log_data["session_stats"]["total_messages"] += 1
    
    # Detect keywords
    if "CLOSE_CALL_CONFIRMED" in request.message:
        log_data["order_status"] = "completed"
        log_data["session_stats"]["keywords_detected"].append("CLOSE_CALL_CONFIRMED")
    
    if "TRANSFER_TO_HUMAN" in request.message:
        log_data["order_status"] = "transferred"
        log_data["session_stats"]["keywords_detected"].append("TRANSFER_TO_HUMAN")
    
    log_data["status"] = request.status
    
    with open(log_file, "w", encoding="utf-8") as f:
        json.dump(log_data, f, ensure_ascii=False, indent=2)
    
    return {"success": True}


# Embedding utilities and endpoints
def chunk_text(text, chunk_size=800, overlap=200):
    chunks = []
    start = 0
    length = len(text)
    while start < length:
        end = min(start + chunk_size, length)
        chunk = text[start:end]
        chunks.append(chunk)
        start += chunk_size - overlap
    return chunks


def build_embeddings_for_text(text):
    """Split text into chunks and create embeddings via OpenAI API, save to EMBEDDINGS_PATH."""
    global client
    if not client:
        raise RuntimeError('OpenAI client not initialized - check OPENAI_API_KEY')

    chunks = chunk_text(text)
    embeddings = []
    vectors = []
    for i, chunk in enumerate(chunks):
        resp = client.embeddings.create(model='text-embedding-3-small', input=chunk)
        vec = resp.data[0].embedding
        embeddings.append({
            'id': f'chunk_{i}',
            'text': chunk,
            'embedding': vec
        })
        vectors.append(vec)

    with open(EMBEDDINGS_PATH, 'w', encoding='utf-8') as f:
        json.dump({'created': datetime.now().isoformat(), 'items': embeddings}, f, ensure_ascii=False)

    # If FAISS available, build an index for faster vector search
    if _FAISS_AVAILABLE and len(vectors) > 0:
        try:
            arr = np.array(vectors).astype('float32')
            dim = arr.shape[1]
            index = faiss.IndexFlatIP(dim)
            # normalize vectors for inner-product = cosine similarity if desired
            faiss.normalize_L2(arr)
            index.add(arr)
            faiss.write_index(index, FAISS_INDEX_PATH)
            # save meta (texts, ids)
            with open(EMBEDDINGS_META_PATH, 'w', encoding='utf-8') as mf:
                json.dump({'items': embeddings}, mf, ensure_ascii=False)
        except Exception as e:
            logger.warning(f"Failed to build FAISS index: {e}")

    # If Pinecone is configured, upsert the vectors into a Pinecone index
    try:
        if _PINECONE_AVAILABLE and os.getenv('PINECONE_API_KEY') and os.getenv('PINECONE_ENV'):
            pinecone.init(api_key=os.getenv('PINECONE_API_KEY'), environment=os.getenv('PINECONE_ENV'))
            index_name = os.getenv('PINECONE_INDEX', 'icai-embeddings')
            if index_name not in pinecone.list_indexes():
                # create index with appropriate dimension
                dim = len(vectors[0]) if len(vectors) > 0 else 1536
                pinecone.create_index(index_name, dimension=dim)
            idx = pinecone.Index(index_name)
            # prepare upsert in batches
            to_upsert = []
            for it in embeddings:
                vec = it['embedding']
                meta = {'text': it['text'], 'id': it['id']}
                to_upsert.append((it['id'], vec, meta))
            # Pinecone expects list of tuples (id, vector, metadata)
            batch_size = 100
            for i in range(0, len(to_upsert), batch_size):
                batch = to_upsert[i:i+batch_size]
                idx.upsert(vectors=batch)
            logger.info('Pinecone upsert complete')
    except Exception as e:
        logger.warning(f"Pinecone upsert skipped/failed: {e}")


def cosine_similarity(a, b):
    # simple cosine for two vectors
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0
    return dot / (norm_a * norm_b)


def _faiss_search(query_vec, k=3):
    """Search using saved FAISS index if available. Returns list of (score, item)"""
    if not _FAISS_AVAILABLE:
        return None
    if not os.path.exists(FAISS_INDEX_PATH) or not os.path.exists(EMBEDDINGS_META_PATH):
        return None
    try:
        index = faiss.read_index(FAISS_INDEX_PATH)
        q = np.array([query_vec]).astype('float32')
        faiss.normalize_L2(q)
        distances, indices = index.search(q, k)
        # distances are inner product after normalization (cosine)
        with open(EMBEDDINGS_META_PATH, 'r', encoding='utf-8') as f:
            meta = json.load(f)
        items = meta.get('items', [])
        results = []
        for score, idx in zip(distances[0], indices[0]):
            if idx < 0 or idx >= len(items):
                continue
            results.append((float(score), items[idx]))
        return results
    except Exception as e:
        logger.warning(f"FAISS search failed: {e}")
        return None


@app.get('/search-pdf')
def search_pdf(q: str = '', k: int = 3):
    """Return top-k chunks matching query using embeddings.json"""
    if not q:
        return {'results': [], 'error': 'Query parameter q is required'}
        
    # If no embeddings exist, do simple text search
    if not os.path.exists(EMBEDDINGS_PATH):
        # Fallback to simple text search in PDF content
        if os.path.exists(PDF_TEXT_PATH):
            with open(PDF_TEXT_PATH, 'r', encoding='utf-8') as f:
                text = f.read()
            
            # Simple keyword matching
            chunks = chunk_text(text)
            matches = []
            q_lower = q.lower()
            
            for chunk in chunks:
                if q_lower in chunk.lower():
                    # Simple relevance score based on keyword frequency
                    score = chunk.lower().count(q_lower) / len(chunk.split())
                    matches.append({'score': score, 'text': chunk})
            
            matches.sort(key=lambda x: x['score'], reverse=True)
            return {'results': matches[:k], 'source': 'text_search'}
        
        return {'results': [], 'error': 'No PDF content available'}

    global client
    if not client:
        return {'results': [], 'error': 'OpenAI client not initialized - check OPENAI_API_KEY'}
    
    try:
        resp = client.embeddings.create(model='text-embedding-3-small', input=q)
        qvec = resp.data[0].embedding
    except Exception as e:
        return {'results': [], 'error': f'Embedding creation failed: {str(e)}'}
    
    # Try FAISS first if available
    faiss_results = _faiss_search(qvec, k=k)
    if faiss_results is not None:
        top = [{'score': s, 'text': it['text']} for s, it in faiss_results[:k]]
        return {'results': top, 'source': 'faiss'}

    # Fallback to JSON cosine scan
    try:
        with open(EMBEDDINGS_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)

        items = data.get('items', [])
        scored = []
        for it in items:
            sim = cosine_similarity(qvec, it['embedding'])
            scored.append((sim, it))

        scored.sort(key=lambda x: x[0], reverse=True)
        top = [{'score': s, 'text': it['text']} for s, it in scored[:k]]
        return {'results': top, 'source': 'json'}
    except Exception as e:
        return {'results': [], 'error': f'Search failed: {str(e)}'}


@app.post('/analyze-emotion')
def analyze_emotion(payload: dict):
    """Return a simple mapping of pitch and rate for a given text using OpenAI.
    Also produce a simple SSML snippet using prosody attributes.
    """
    text = payload.get('text', '')
    if not text:
        return {'pitch': 1.0, 'rate': 1.0, 'emotion': 'neutral'}

    global client
    if not client:
        # fallback: rule-based
        low = text.lower()
        if 'sorry' in low or 'apolog' in low:
            return {'pitch': 0.9, 'rate': 0.95, 'emotion': 'apologetic'}
        if 'congrat' in low or 'great' in low or 'thanks' in low:
            return {'pitch': 1.2, 'rate': 1.05, 'emotion': 'happy'}
        return {'pitch': 1.0, 'rate': 1.0, 'emotion': 'neutral'}

    try:
        prompt = (
            "Analyze the emotion and suggest simple speech parameters. "
            "Return only a JSON object with keys: emotion (string), pitch (number), rate (number). "
            "Examples: {\"emotion\": \"neutral\", \"pitch\": 1.0, \"rate\": 1.0}.\n\n"
            f"Text: {text}\n\nJSON:")

        resp = client.chat.completions.create(
            model='gpt-3.5-turbo',
            messages=[
                {"role": "system", "content": "You are an assistant that maps text to short emotion labels and simple pitch/rate values."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.0,
            max_tokens=60
        )
        reply = resp.choices[0].message.content.strip()
        # Attempt to parse JSON from reply
        try:
            parsed = json.loads(reply)
            pitch = parsed.get('pitch', 1.0)
            rate = parsed.get('rate', 1.0)
            emotion = parsed.get('emotion', 'neutral')
        except Exception:
            # Fallback: return defaults
            pitch = 1.0
            rate = 1.0
            emotion = 'neutral'

        # Generate a simple SSML snippet
        # Map numeric pitch to percent expression: (pitch - 1.0) * 50 -> +/- percent
        try:
            pitch_pct = int((float(pitch) - 1.0) * 50)
        except Exception:
            pitch_pct = 0
        # Map rate to percent (100% = normal). Use range ~50..150
        try:
            rate_pct = int(float(rate) * 100)
        except Exception:
            rate_pct = 100

        prosody_attrs = []
        if pitch_pct != 0:
            prosody_attrs.append(f'pitch="{pitch_pct:+}%'+'"')
        prosody_attrs.append(f'rate="{rate_pct}%"')
        prosody = ' '.join(prosody_attrs)
        ssml = f'<speak><prosody {prosody}>{escape_xml(text)}</prosody></speak>'

        return {'pitch': pitch, 'rate': rate, 'emotion': emotion, 'ssml': ssml}
    except Exception as e:
        logger.warning(f"Emotion analysis failed: {e}")
        return {'pitch': 1.0, 'rate': 1.0, 'emotion': 'neutral', 'ssml': f'<speak><prosody rate="100%">{escape_xml(text)}</prosody></speak>'}


def escape_xml(s: str) -> str:
    return (s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;').replace("'","&apos;"))


@app.post('/synthesize-ssml')
def synthesize_ssml(payload: dict):
    """Synthesize SSML to audio. If pyttsx3 is available, synthesize to wav and return bytes.
    Otherwise return the SSML string so client can handle TTS.
    """
    text = payload.get('text', '')
    ssml = payload.get('ssml')
    if not ssml:
        # fallback: create SSML from text using neutral prosody
        ssml = f'<speak><prosody rate="100%">{escape_xml(text)}</prosody></speak>'

    if _PYTTSX3_AVAILABLE:
        try:
            engine = pyttsx3.init()
            # Save to a temporary wav file
            tmpf = os.path.join(tempfile.gettempdir(), f'ssml_{int(time.time()*1000)}.wav')
            # pyttsx3 may not support SSML directly; strip tags for basic synthesis
            import re
            plain = re.sub(r'<[^>]+>', '', ssml)
            engine.save_to_file(plain, tmpf)
            engine.runAndWait()
            with open(tmpf, 'rb') as f:
                data = f.read()
            try:
                os.remove(tmpf)
            except Exception:
                pass
            return JSONResponse(content=data, media_type='audio/wav')
        except Exception as e:
            logger.warning(f"pyttsx3 synthesis failed: {e}")
            return {'ssml': ssml}

    # No TTS provider, return SSML for client-side consumption
    return {'ssml': ssml}


@app.post('/save-user-prefs')
def save_user_prefs(payload: dict):
    """Save user preferences to a simple JSON file. Payload must contain 'user_id' and 'prefs' dict."""
    user_id = payload.get('user_id', 'default')
    prefs = payload.get('prefs', {})
    try:
        if os.path.exists(USER_PREFS_PATH):
            with open(USER_PREFS_PATH, 'r', encoding='utf-8') as f:
                allp = json.load(f)
        else:
            allp = {}
        allp[user_id] = prefs
        with open(USER_PREFS_PATH, 'w', encoding='utf-8') as f:
            json.dump(allp, f, ensure_ascii=False, indent=2)
        return {'success': True}
    except Exception as e:
        logger.error(f"Failed to save prefs: {e}")
        return JSONResponse(status_code=500, content={'error': str(e)})


@app.get('/user-prefs')
def get_user_prefs(user_id: str = 'default'):
    try:
        if os.path.exists(USER_PREFS_PATH):
            with open(USER_PREFS_PATH, 'r', encoding='utf-8') as f:
                allp = json.load(f)
            return allp.get(user_id, {})
        return {}
    except Exception as e:
        logger.error(f"Failed to load prefs: {e}")
        return {}

@app.get('/current-pdf')
def get_current_pdf():
    """Get currently selected PDF info for all users"""
    global SELECTED_PDF_ID
    if SELECTED_PDF_ID and os.path.exists(os.path.join(PDF_STORAGE_DIR, SELECTED_PDF_ID)):
        original_name = SELECTED_PDF_ID.split('_', 1)[1] if '_' in SELECTED_PDF_ID else SELECTED_PDF_ID
        return {
            "selected": True,
            "id": SELECTED_PDF_ID,
            "filename": original_name
        }
    return {"selected": False}

@app.get("/call-logs")
def get_call_logs():
    if not os.path.exists(CALL_LOGS_DIR):
        return {"logs": []}
    
    logs = []
    for filename in os.listdir(CALL_LOGS_DIR):
        if filename.endswith('.json'):
            file_path = os.path.join(CALL_LOGS_DIR, filename)
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    log_data = json.load(f)
                    logs.append({
                        "session_id": log_data["session_id"],
                        "start_time": log_data["start_time"],
                        "message_count": len(log_data["messages"]),
                        "last_message": log_data["messages"][-1]["timestamp"] if log_data["messages"] else log_data["start_time"],
                        "status": log_data.get("status", "active"),
                        "order_status": log_data.get("order_status", "none")
                    })
            except Exception as e:
                logger.error(f"Error reading log file {filename}: {e}")
    
    logs.sort(key=lambda x: x["start_time"], reverse=True)
    return {"logs": logs}

@app.get("/call-logs/{session_id}")
def get_call_log_detail(session_id: str):
    log_file = os.path.join(CALL_LOGS_DIR, f"{session_id}.json")
    
    if not os.path.exists(log_file):
        return JSONResponse(status_code=404, content={"error": "Log tidak ditemukan"})
    
    try:
        with open(log_file, "r", encoding="utf-8") as f:
            log_data = json.load(f)
        return log_data
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/request-staff-takeover")
async def request_staff_takeover(request: StaffTakeoverRequest):
    try:
        log_file = os.path.join(CALL_LOGS_DIR, f"{request.session_id}.json")
        
        if os.path.exists(log_file):
            with open(log_file, "r", encoding="utf-8") as f:
                log_data = json.load(f)
        else:
            log_data = {
                "session_id": request.session_id,
                "start_time": datetime.now().isoformat(),
                "messages": []
            }
        
        log_data["messages"].append({
            "type": "system",
            "message": f"Staff takeover requested: {request.message}",
            "timestamp": datetime.now().isoformat()
        })
        
        log_data["status"] = "staff_requested"
        
        with open(log_file, "w", encoding="utf-8") as f:
            json.dump(log_data, f, ensure_ascii=False, indent=2)
        
        logger.info(f"Staff takeover requested for session {request.session_id}")
        return {"success": True, "message": "Staff takeover requested"}
        
    except Exception as e:
        logger.error(f"Error requesting staff takeover: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/close-call")
async def close_call(request: CallLogRequest):
    try:
        log_file = os.path.join(CALL_LOGS_DIR, f"{request.session_id}.json")
        
        if os.path.exists(log_file):
            with open(log_file, "r", encoding="utf-8") as f:
                log_data = json.load(f)
        else:
            return JSONResponse(status_code=404, content={"error": "Session not found"})
        
        log_data["messages"].append({
            "type": "system",
            "message": "Call closed",
            "timestamp": datetime.now().isoformat()
        })
        
        log_data["status"] = "completed"
        log_data["end_time"] = datetime.now().isoformat()
        
        with open(log_file, "w", encoding="utf-8") as f:
            json.dump(log_data, f, ensure_ascii=False, indent=2)
        
        logger.info(f"Call closed for session {request.session_id}")
        return {"success": True, "message": "Call closed"}
        
    except Exception as e:
        logger.error(f"Error closing call: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/clear-logs")
async def clear_logs():
    try:
        # Clear all log files
        if os.path.exists(CALL_LOGS_DIR):
            for filename in os.listdir(CALL_LOGS_DIR):
                if filename.endswith('.json'):
                    file_path = os.path.join(CALL_LOGS_DIR, filename)
                    os.remove(file_path)
        
        logger.info("All session logs cleared")
        return {"success": True, "message": "All logs cleared successfully"}
        
    except Exception as e:
        logger.error(f"Error clearing logs: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/confirm-order")
async def confirm_order(request: OrderConfirmationRequest):
    try:
        log_file = os.path.join(CALL_LOGS_DIR, f"{request.session_id}.json")
        
        if os.path.exists(log_file):
            with open(log_file, "r", encoding="utf-8") as f:
                log_data = json.load(f)
        else:
            log_data = {
                "session_id": request.session_id,
                "start_time": datetime.now().isoformat(),
                "messages": []
            }
        
        order_details = {
            "session_id": request.session_id,
            "customer_name": request.customer_name,
            "customer_phone": request.customer_phone,
            "customer_email": request.customer_email,
            "delivery_address": request.delivery_address,
            "order_items": request.order_items,
            "total_amount": request.total_amount,
            "notes": request.notes,
            "order_time": datetime.now().isoformat()
        }
        
        log_data["order_details"] = order_details
        log_data["order_status"] = "confirmed"
        
        log_data["messages"].append({
            "type": "system",
            "message": f"Pesanan dikonfirmasi untuk {request.customer_name}",
            "timestamp": datetime.now().isoformat()
        })
        
        with open(log_file, "w", encoding="utf-8") as f:
            json.dump(log_data, f, ensure_ascii=False, indent=2)
        
        # Log order for manual processing
        with open("confirmed_orders.txt", "a", encoding="utf-8") as f:
            f.write(f"\n{datetime.now().isoformat()}\n")
            f.write(f"Order ID: {request.session_id[:8]}\n")
            f.write(f"Customer: {request.customer_name}\n")
            f.write(f"Phone: {request.customer_phone}\n")
            f.write(f"Email: {request.customer_email}\n")
            f.write(f"Address: {request.delivery_address}\n")
            f.write(f"Items: {', '.join(request.order_items)}\n")
            f.write(f"Total: Rp {request.total_amount:,.0f}\n")
            f.write(f"Notes: {request.notes}\n")
            f.write("="*50 + "\n")
        
        logger.info(f"Order confirmed for session {request.session_id}")
        return {
            "success": True, 
            "message": "Pesanan berhasil dikonfirmasi",
            "order_id": request.session_id[:8]
        }
        
    except Exception as e:
        logger.error(f"Error confirming order: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

if __name__ == "__main__":
    import uvicorn
    import sys
    
    # Azure App Service menyediakan port melalui env var PORT
    port = int(os.environ.get("PORT", 8000))
    
    print(f"Starting server on host 0.0.0.0 and port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
