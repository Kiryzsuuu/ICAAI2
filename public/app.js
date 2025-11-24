class RealtimePlayground {
    constructor() {
        this.socket = null;
        this.sessionId = null;
        this.isConnected = false;
        this.audioContext = null;
        this.audioWorklet = null;
        this.mediaStream = null;
        this.audioPlayer = null;
        this.currentResponse = null;
        this.currentUserTranscript = null;
        this.isRecording = false;
        this.shownTranscripts = new Set(); // Track shown transcripts to prevent duplicates
        
        // mouth control defaults (will be overridden by UI if present)
        this.mouthSensitivity = 1.0; // multiplier for mouth scale
        this.mouthResponsiveness = 0.3; // how much new sample affects mouth (0..1)

        this.initializeElements();
        this.setupEventListeners();
    }
    
    initializeElements() {
        // Get current user info from token
        this.currentUser = null;
        const token = localStorage.getItem('icaai_token');
        if (token) {
            fetch('/api/user', {
                headers: { 'Authorization': 'Bearer ' + token }
            })
            .then(res => res.json())
            .then(data => {
                if (data.user) {
                    this.currentUser = { username: data.user.email, role: data.user.isAdmin ? 'admin' : 'user' };
                    if (this.currentUser.role === 'admin') {
                        this.setupPDFHandlers();
                    } else {
                        this.loadPDFListReadOnly();
                    }
                }
            })
            .catch(e => console.error('Failed to get user info', e));
        }
        
        this.connectBtn = document.getElementById('connectBtn');
        this.micBtn = document.getElementById('micBtn');
        this.disconnectBtn = document.getElementById('disconnectBtn');
        this.statusTitle = document.getElementById('statusTitle');
        this.statusSubtitle = document.getElementById('statusSubtitle');
        this.agentAvatar = document.getElementById('agentAvatar');
        this.messages = document.getElementById('messages');
        this.messageInput = document.getElementById('messageInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.uploadArea = document.getElementById('uploadArea');
        this.fileInput = document.getElementById('fileInput');
        this.pdfList = document.getElementById('pdfList');
        // Debug overlay elements
        this.debugMicEl = document.getElementById('debugMic');
        this.debugIncomingEl = document.getElementById('debugIncoming');
        this.debugAudioReceivedEl = document.getElementById('debugAudioReceived');
        this.currentResponseHasAudio = false;

        // Mouth tuning controls (if present in DOM)
        this.mouthSensitivityEl = document.getElementById('mouthSensitivity');
        this.mouthSmoothingEl = document.getElementById('mouthSmoothing');
        this.mouthSensitivityValEl = document.getElementById('mouthSensitivityVal');
        this.mouthSmoothingValEl = document.getElementById('mouthSmoothingVal');

    // Agent configuration elements in panel
    this.cfgInstructionsEl = document.getElementById('cfg_instructions');
    this.cfgVoiceEl = document.getElementById('cfg_voice');
    this.cfgTemperatureEl = document.getElementById('cfg_temperature');
    this.cfgSaveBtn = document.getElementById('cfgSaveBtn');
    this.cfgLoadBtn = document.getElementById('cfgLoadBtn');
    this.cfgResetBtn = document.getElementById('cfgResetBtn');
    this.cfgVerbosityEl = document.getElementById('cfg_verbosity');
    this.cfgPersonaEl = document.getElementById('cfg_persona');
    this.cfgPreviewBtn = document.getElementById('cfgPreviewBtn');

    // Debug elements inside config panel
    this.configDebugMic = document.getElementById('configDebugMic');
    this.configDebugIncoming = document.getElementById('configDebugIncoming');
    this.configDebugAudioReceived = document.getElementById('configDebugAudioReceived');

        if (this.mouthSensitivityEl) {
            this.mouthSensitivity = parseFloat(this.mouthSensitivityEl.value) || this.mouthSensitivity;
            this.mouthSensitivityEl.addEventListener('input', (e) => {
                this.mouthSensitivity = parseFloat(e.target.value) || 1.0;
                if (this.mouthSensitivityValEl) this.mouthSensitivityValEl.textContent = this.mouthSensitivity.toFixed(2);
                // persist to server
                this.saveUserPrefsDebounced({ mouthSensitivity: this.mouthSensitivity, mouthSmoothing: (1 - this.mouthResponsiveness) });
            });
            if (this.mouthSensitivityValEl) this.mouthSensitivityValEl.textContent = this.mouthSensitivity.toFixed(2);
        }

        if (this.mouthSmoothingEl) {
            // UI value maps to "smoothing" where 0 = instant, 1 = very smooth
            const uiVal = parseFloat(this.mouthSmoothingEl.value);
            // Convert to responsiveness r = (1 - smoothing)
            this.mouthResponsiveness = 1 - (isNaN(uiVal) ? 0.7 : uiVal);
            this.mouthSmoothingEl.addEventListener('input', (e) => {
                const v = parseFloat(e.target.value) || 0;
                if (this.mouthSmoothingValEl) this.mouthSmoothingValEl.textContent = v.toFixed(2);
                this.mouthResponsiveness = 1 - v;
                this.saveUserPrefsDebounced({ mouthSensitivity: this.mouthSensitivity, mouthSmoothing: v });
            });
            if (this.mouthSmoothingValEl) this.mouthSmoothingValEl.textContent = (1 - this.mouthResponsiveness).toFixed(2);
        }

    if (this.cfgSaveBtn) this.cfgSaveBtn.addEventListener('click', (e) => { e.preventDefault(); this.saveAgentConfig(); });
    if (this.cfgLoadBtn) this.cfgLoadBtn.addEventListener('click', (e) => { e.preventDefault(); this.loadAgentConfig(); });
    if (this.cfgResetBtn) this.cfgResetBtn.addEventListener('click', (e) => { e.preventDefault(); this.resetAgentConfig(); });
    if (this.cfgPreviewBtn) this.cfgPreviewBtn.addEventListener('click', (e) => { e.preventDefault(); this.previewPersona(); });

        // Configuration panel elements
        this.configToggleBtn = document.getElementById('configToggleBtn');
        this.configPanel = document.getElementById('configPanel');
        this.configCloseBtn = document.getElementById('configCloseBtn');
        this.configBackdrop = document.getElementById('configBackdrop');
        
        // Monitoring panel elements
        this.monitoringToggleBtn = document.getElementById('monitoringToggleBtn');
        this.monitoringPanel = document.getElementById('monitoringPanel');
        this.monitoringCloseBtn = document.getElementById('monitoringCloseBtn');
        this.monitoringBackdrop = document.getElementById('monitoringBackdrop');
        this.activityChart = document.getElementById('activityChart');
        this.chartData = [];
        this.maxDataPoints = 15;

        if (this.configToggleBtn) {
            this.configToggleBtn.addEventListener('click', () => this.toggleConfigPanel());
        }

        if (this.configCloseBtn) {
            this.configCloseBtn.addEventListener('click', () => this.toggleConfigPanel(false));
        }

        if (this.configBackdrop) {
            this.configBackdrop.addEventListener('click', () => this.toggleConfigPanel(false));
        }
        
        if (this.monitoringToggleBtn) {
            this.monitoringToggleBtn.addEventListener('click', () => this.toggleMonitoringPanel());
        }
        
        if (this.monitoringCloseBtn) {
            this.monitoringCloseBtn.addEventListener('click', () => this.toggleMonitoringPanel(false));
        }
        
        if (this.monitoringBackdrop) {
            this.monitoringBackdrop.addEventListener('click', () => this.toggleMonitoringPanel(false));
        }

        // Restore last config panel state from localStorage
        try {
            const open = localStorage.getItem('configPanelOpen');
            if (open === '1') this.toggleConfigPanel(true);
            // also open if URL contains ?openConfig=1 or #config
            try {
                const urlParams = new URLSearchParams(window.location.search);
                if (urlParams.get('openConfig') === '1' || window.location.hash === '#config') {
                    this.toggleConfigPanel(true);
                    try { localStorage.setItem('configPanelOpen', '1'); } catch (e) {}
                }
            } catch (e) {}
        } catch (e) {}

        // Try to load saved prefs for current user and apply
        try {
            const userId = this.currentUser ? this.currentUser.username : 'default';
            fetch(`http://127.0.0.1:8004/user-prefs?user_id=${userId}`).then(r => r.json()).then(p => {
                if (p) {
                    if (typeof p.mouthSensitivity === 'number' && this.mouthSensitivityEl) {
                        this.mouthSensitivity = p.mouthSensitivity;
                        this.mouthSensitivityEl.value = String(this.mouthSensitivity);
                        if (this.mouthSensitivityValEl) this.mouthSensitivityValEl.textContent = this.mouthSensitivity.toFixed(2);
                    }
                    if (typeof p.mouthSmoothing === 'number' && this.mouthSmoothingEl) {
                        this.mouthSmoothingEl.value = String(p.mouthSmoothing);
                        if (this.mouthSmoothingValEl) this.mouthSmoothingValEl.textContent = p.mouthSmoothing.toFixed(2);
                        this.mouthResponsiveness = 1 - p.mouthSmoothing;
                    }
                }
            }).catch(()=>{});
        } catch(e) {}
        // Load the current agent configuration into the panel (admin only)
        if (this.currentUser && this.currentUser.role === 'admin') {
            try { this.loadAgentConfig(); } catch (e) {}
        }
        
        // Start monitoring updates (admin only)
        if (this.currentUser && this.currentUser.role === 'admin') {
            this.startMonitoring();
        }
    }

    toggleConfigPanel(open) {
        // if open is undefined, toggle
        const panel = this.configPanel;
        if (!panel) return;
        const isOpen = panel.classList.contains('open');
        const target = (typeof open === 'boolean') ? open : !isOpen;
        if (target) {
            panel.classList.add('open');
            panel.setAttribute('aria-hidden', 'false');
            if (this.configBackdrop) this.configBackdrop.classList.add('show');
            if (this.configToggleBtn) this.configToggleBtn.setAttribute('aria-expanded', 'true');
            try { localStorage.setItem('configPanelOpen', '1'); } catch (e) {}
        } else {
            panel.classList.remove('open');
            panel.setAttribute('aria-hidden', 'true');
            if (this.configBackdrop) this.configBackdrop.classList.remove('show');
            if (this.configToggleBtn) this.configToggleBtn.setAttribute('aria-expanded', 'false');
            try { localStorage.setItem('configPanelOpen', '0'); } catch (e) {}
        }
    }

    // Save user prefs (debounced to avoid frequent calls)
    _savePrefsDebounceTimer = null;
    saveUserPrefsDebounced(prefs) {
        try {
            if (this._savePrefsDebounceTimer) clearTimeout(this._savePrefsDebounceTimer);
            this._savePrefsDebounceTimer = setTimeout(() => {
                const userId = this.currentUser ? this.currentUser.username : 'default';
                const payload = { user_id: userId, prefs };
                fetch('http://127.0.0.1:8004/save-user-prefs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }).catch((e) => console.warn('Failed to save prefs', e));
            }, 400);
        } catch (e) {}
    }
    
    setupEventListeners() {
        this.connectBtn.addEventListener('click', () => this.connect());
        this.disconnectBtn.addEventListener('click', () => this.disconnect());
        this.micBtn.addEventListener('click', () => this.toggleMicrophone());
        this.sendBtn.addEventListener('click', () => this.sendTextMessage());
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendTextMessage();
        });

        // Close config panel on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.configPanel && this.configPanel.classList.contains('open')) {
                    this.toggleConfigPanel(false);
                }
            }
        });
    }

    async loadAgentConfig() {
        try {
            const headers = {};
            if (this.currentUser && this.currentUser.role === 'admin') {
                headers.authorization = 'admin';
            }
            const resp = await fetch('/api/config', { headers });
            if (!resp.ok) return;
            const cfg = await resp.json();
            if (this.cfgInstructionsEl) this.cfgInstructionsEl.value = cfg.instructions || '';
            if (this.cfgVoiceEl) this.cfgVoiceEl.value = cfg.voice || 'alloy';
            if (this.cfgTemperatureEl) this.cfgTemperatureEl.value = cfg.temperature != null ? String(cfg.temperature) : '0.7';
            if (this.cfgVerbosityEl) this.cfgVerbosityEl.value = cfg.verbosity || 'balanced';
            if (this.cfgPersonaEl) this.cfgPersonaEl.value = cfg.persona || 'professional';
            // apply certain parts immediately
            // update internal mouth prefs if present in saved prefs
            return cfg;
        } catch (e) {
            console.warn('Failed to load agent config', e);
        }
    }

    async saveAgentConfig() {
        if (!this.currentUser || this.currentUser.role !== 'admin') {
            this.addMessage('system', 'Admin access required');
            return;
        }
        try {
            const payload = {
                instructions: this.cfgInstructionsEl ? this.cfgInstructionsEl.value : '',
                voice: this.cfgVoiceEl ? this.cfgVoiceEl.value : 'alloy',
                temperature: this.cfgTemperatureEl ? parseFloat(this.cfgTemperatureEl.value) || 0.7 : 0.7,
                verbosity: this.cfgVerbosityEl ? this.cfgVerbosityEl.value : 'balanced',
                persona: this.cfgPersonaEl ? this.cfgPersonaEl.value : 'professional'
            };
            const resp = await fetch('/api/config', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'authorization': 'admin'
                },
                body: JSON.stringify(payload)
            });
            if (resp.ok) {
                this.addMessage('system', 'Configuration saved');
                // also persist per-user prefs on backend
                try {
                    const prefs = { agent_config: payload };
                    const userId = this.currentUser ? this.currentUser.username : 'default';
                    fetch('http://127.0.0.1:8004/save-user-prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, prefs }) }).catch(()=>{});
                } catch(e) {}
            } else {
                this.addMessage('system', 'Failed to save configuration');
            }
        } catch (e) {
            console.warn('Save config failed', e);
            this.addMessage('system', 'Error saving configuration');
        }
    }

    async resetAgentConfig() {
        try {
            // reset to some defaults
            const defaults = {
                instructions: "Anda adalah Interactive Call Agent AI yang membantu pelanggan dengan ramah dan profesional. Jawab dengan singkat dan jelas.",
                voice: 'alloy',
                temperature: 0.7
            };
            if (this.cfgInstructionsEl) this.cfgInstructionsEl.value = defaults.instructions;
            if (this.cfgVoiceEl) this.cfgVoiceEl.value = defaults.voice;
            if (this.cfgTemperatureEl) this.cfgTemperatureEl.value = String(defaults.temperature);
            if (this.cfgVerbosityEl) this.cfgVerbosityEl.value = 'balanced';
            if (this.cfgPersonaEl) this.cfgPersonaEl.value = 'professional';
            // send to server
            await fetch('/api/config', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'authorization': 'admin'
                },
                body: JSON.stringify(defaults)
            });
            this.addMessage('system', 'Configuration reset to defaults');
        } catch (e) {
            console.warn('Reset config failed', e);
            this.addMessage('system', 'Failed to reset configuration');
        }
    }

    previewPersona() {
        // simple preview: show a canned agent message reflecting persona & verbosity
        const persona = this.cfgPersonaEl ? this.cfgPersonaEl.value : 'professional';
        const verbosity = this.cfgVerbosityEl ? this.cfgVerbosityEl.value : 'balanced';
        let sample = '';
        if (persona === 'friendly') sample = 'Hai! Aku senang membantu — bilang saja yang kamu butuhkan, saya bantu dengan senang hati.';
        else if (persona === 'empathetic') sample = 'Saya mengerti situasi Anda. Mari kita selesaikan ini bersama — bisakah Anda beri tahu detailnya?';
        else if (persona === 'sales') sample = 'Halo! Kami punya penawaran menarik yang mungkin membantu kebutuhan Anda. Mau tahu lebih lanjut?';
        else sample = 'Halo! Saya siap membantu Anda. Apa yang bisa saya bantu hari ini?';

        // adjust length by verbosity
        if (verbosity === 'concise') sample = sample.split('.').slice(0,1).join('.');
        if (verbosity === 'detailed') sample = sample + ' Saya dapat membantu dengan langkah-langkah rinci dan opsi yang tersedia.';

        this.addMessage('agent', sample);
    }
    
    toggleMonitoringPanel(open) {
        const panel = this.monitoringPanel;
        if (!panel) return;
        const isOpen = panel.classList.contains('open');
        const target = (typeof open === 'boolean') ? open : !isOpen;
        if (target) {
            panel.classList.add('open');
            panel.setAttribute('aria-hidden', 'false');
            if (this.monitoringBackdrop) this.monitoringBackdrop.classList.add('show');
            if (this.monitoringToggleBtn) this.monitoringToggleBtn.setAttribute('aria-expanded', 'true');
            this.updateMonitoringData();
        } else {
            panel.classList.remove('open');
            panel.setAttribute('aria-hidden', 'true');
            if (this.monitoringBackdrop) this.monitoringBackdrop.classList.remove('show');
            if (this.monitoringToggleBtn) this.monitoringToggleBtn.setAttribute('aria-expanded', 'false');
        }
    }
    
    startMonitoring() {
        // Update monitoring data every 3 seconds
        setInterval(() => {
            if (this.monitoringPanel && this.monitoringPanel.classList.contains('open')) {
                this.updateMonitoringData();
            }
        }, 3000);
    }
    
    async updateMonitoringData() {
        if (!this.currentUser || this.currentUser.role !== 'admin') return;
        try {
            const headers = { authorization: 'admin' };
            const response = await fetch('/api/monitoring', { headers });
            const data = await response.json();
            
            // Update stats
            document.getElementById('activeSessions').textContent = data.stats.activeSessions;
            document.getElementById('totalMessages').textContent = data.stats.totalMessages;
            document.getElementById('totalAudioChunks').textContent = data.stats.totalAudioChunks;
            document.getElementById('uptime').textContent = this.formatUptime(data.stats.uptime);
            
            // Update chart
            this.updateChart(data.stats);
            
            // Update sessions list
            this.updateSessionsList(data.sessions);
            
        } catch (error) {
            console.warn('Failed to update monitoring data:', error);
        }
    }
    
    updateChart(stats) {
        if (!this.activityChart) return;
        
        // Add new data point
        this.chartData.push({
            time: Date.now(),
            messages: stats.totalMessages,
            audio: stats.totalAudioChunks
        });
        
        // Keep only last N data points
        if (this.chartData.length > this.maxDataPoints) {
            this.chartData.shift();
        }
        
        // Draw chart
        this.drawChart();
    }
    
    drawChart() {
        const canvas = this.activityChart;
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const padding = 10;
        const chartWidth = width - (padding * 2);
        const chartHeight = height - (padding * 2);
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        if (this.chartData.length < 2) {
            // Show "No data" message
            ctx.fillStyle = '#9ca3af';
            ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Collecting data...', width / 2, height / 2);
            return;
        }
        
        // Find max values for scaling
        const maxMessages = Math.max(...this.chartData.map(d => d.messages));
        const maxAudio = Math.max(...this.chartData.map(d => d.audio));
        const maxValue = Math.max(maxMessages, maxAudio, 10);
        
        // Draw background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        
        // Draw grid lines
        ctx.strokeStyle = '#f1f5f9';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padding + (chartHeight / 4) * i;
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(width - padding, y);
            ctx.stroke();
        }
        
        // Draw messages line (blue)
        ctx.strokeStyle = '#0366d6';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        this.chartData.forEach((point, index) => {
            const x = padding + (chartWidth / (this.chartData.length - 1)) * index;
            const y = padding + chartHeight - (point.messages / maxValue) * chartHeight;
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();
        
        // Draw messages points
        ctx.fillStyle = '#0366d6';
        this.chartData.forEach((point, index) => {
            const x = padding + (chartWidth / (this.chartData.length - 1)) * index;
            const y = padding + chartHeight - (point.messages / maxValue) * chartHeight;
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, 2 * Math.PI);
            ctx.fill();
        });
        
        // Draw audio line (green)
        ctx.strokeStyle = '#059669';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        this.chartData.forEach((point, index) => {
            const x = padding + (chartWidth / (this.chartData.length - 1)) * index;
            const y = padding + chartHeight - (point.audio / maxValue) * chartHeight;
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();
        
        // Draw audio points
        ctx.fillStyle = '#059669';
        this.chartData.forEach((point, index) => {
            const x = padding + (chartWidth / (this.chartData.length - 1)) * index;
            const y = padding + chartHeight - (point.audio / maxValue) * chartHeight;
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, 2 * Math.PI);
            ctx.fill();
        });
    }
    
    updateSessionsList(sessions) {
        const container = document.getElementById('sessionsList');
        if (!container) return;
        
        // Show refresh indicator
        const refreshIndicator = document.getElementById('refreshIndicator');
        if (refreshIndicator) {
            refreshIndicator.style.display = 'inline-block';
            setTimeout(() => {
                refreshIndicator.style.display = 'none';
            }, 500);
        }
        
        if (sessions.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div>🔍 No active sessions</div>
                    <div style="margin-top:4px;font-size:10px;">Sessions will appear here when users connect</div>
                </div>
            `;
            return;
        }
        
        container.innerHTML = sessions.map(session => {
            const statusClass = session.isConnected ? 
                (session.hasOngoingResponse ? 'status-busy' : 'status-connected') : 
                'status-disconnected';
            
            const statusText = session.isConnected ? 
                (session.hasOngoingResponse ? 'Processing' : 'Connected') : 
                'Disconnected';
            
            const sessionTime = new Date().toLocaleTimeString('en-US', { 
                hour12: false, 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            
            return `
                <div class="session-item">
                    <div class="session-header">
                        <div class="session-id">${session.sessionId.substring(0, 12)}...</div>
                        <div class="session-time">${sessionTime}</div>
                    </div>
                    <div class="session-status ${statusClass}">
                        <span class="status-dot"></span>
                        ${statusText}
                    </div>
                </div>
            `;
        }).join('');
    }
    
    formatUptime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${secs}s`;
        } else {
            return `${secs}s`;
        }
    }
    
    async connect() {
        try {
            this.updateStatus('Connecting...', 'Establishing connection');
            this.connectBtn.disabled = true;
            
            // Ensure user interaction for audio context
            await this.ensureUserInteraction();
            
            // Initialize Socket.IO
            this.socket = io();
            this.sessionId = Date.now().toString();
            
            // Setup socket event listeners
            this.setupSocketListeners();
            
            // Initialize audio
            await this.initializeAudio();
            
            // Connect to realtime
            this.socket.emit('connect-realtime', { sessionId: this.sessionId });
            
        } catch (error) {
            console.error('Connection error:', error);
            this.updateStatus('Connection failed', error.message);
            this.connectBtn.disabled = false;
            
            // Show user-friendly error message
            this.addMessage('system', 'Connection failed: ' + error.message);
        }
    }
    
    async ensureUserInteraction() {
        // This function ensures we have user interaction for audio
        // The connect button click itself provides the interaction
        return new Promise((resolve) => {
            // Create a temporary audio context to test
            const testContext = new (window.AudioContext || window.webkitAudioContext)();
            if (testContext.state === 'suspended') {
                testContext.resume().then(() => {
                    testContext.close();
                    resolve();
                }).catch(() => {
                    testContext.close();
                    resolve(); // Continue anyway
                });
            } else {
                testContext.close();
                resolve();
            }
        });
    }
    
    setupSocketListeners() {
        this.socket.on('realtime-connected', (data) => {
            this.isConnected = true;
            this.updateStatus('Connected', 'Listening...');
            this.connectBtn.classList.add('hidden');
            this.disconnectBtn.classList.remove('hidden');
            this.micBtn.disabled = false;
            this.messageInput.disabled = false;
            this.sendBtn.disabled = false;
            
            // Auto-enable microphone like LiveKit
            this.isRecording = true;
            this.micBtn.classList.add('active');
            
            this.addMessage('system', 'Connected to AI agent - Microphone active');
            
            // For users, show current PDF status
            if (this.currentUser && this.currentUser.role === 'user') {
                this.loadPDFListReadOnly();
            }
        });
        
        this.socket.on('audio-delta', (data) => {
            console.debug('socket audio-delta event received:', data && (data.delta ? `[delta len ${data.delta.length}]` : data));
            if (data.delta && this.audioPlayer) {
                const audioData = this.base64ToArrayBuffer(data.delta);
                
                // Expose last chunk for debugging
                try { window._lastAudioChunk = audioData; } catch (e) {}
                
                // Validate audio data
                if (!audioData || audioData.byteLength === 0) {
                    console.warn('Received empty audio data');
                    return;
                }
                
                // Compute RMS from incoming PCM16 audio and update avatar mouth
                try {
                    const level = this.computeRMSFromPCM16(audioData);
                    // mark that current response included audio
                    this.currentResponseHasAudio = true;
                    this._incomingLevel = level;
                    if (this.debugIncomingEl) this.debugIncomingEl.textContent = `Incoming level: ${level.toFixed(2)}`;
                    if (this.configDebugIncoming) this.configDebugIncoming.textContent = `Incoming level: ${level.toFixed(2)}`;
                    if (this.debugAudioReceivedEl) this.debugAudioReceivedEl.textContent = `Audio received: Yes (${audioData.byteLength} bytes)`;
                    if (this.configDebugAudioReceived) this.configDebugAudioReceived.textContent = `Audio received: Yes (${audioData.byteLength} bytes)`;
                    this.updateAvatarMouth(level);
                } catch (e) {
                    console.warn('RMS computation error:', e);
                }

                // Play with enhanced error handling
                try {
                    console.debug('Playing audio chunk:', audioData.byteLength, 'bytes');
                    this.playAudio(audioData);
                } catch (playErr) {
                    console.error('Error invoking playAudio:', playErr);
                    this.addMessage('system', 'Audio playback error - check console for details');
                }
            } else {
                console.warn('No audio data or audio player not available');
            }
        });
        
        this.socket.on('text-delta', (data) => {
            if (data.delta) {
                if (!this.currentResponse) {
                    this.startNewResponse();
                }
                this.appendToCurrentResponse(data.delta);
            }
        });
        
        this.socket.on('user-speech-start', () => {
            console.log('User started speaking');
        });
        
        this.socket.on('user-speech-end', () => {
            console.log('User finished speaking');
        });
        
        this.socket.on('speech-started', () => {
            console.log('Agent speech started');
            this.agentAvatar.classList.add('speaking');
            this.currentResponseHasAudio = false;
        });
        
        this.socket.on('speech-stopped', () => {
            console.log('Agent speech stopped');
            this.agentAvatar.classList.remove('speaking');
            // reset mouth to neutral when speech stops
            this.updateAvatarMouth(0);
            if (this.debugAudioReceivedEl) this.debugAudioReceivedEl.textContent = `Audio received: No`;
            if (this.configDebugAudioReceived) this.configDebugAudioReceived.textContent = `Audio received: No`;
        });
        
        this.socket.on('response-done', () => {
            console.log('Response done, audio received:', this.currentResponseHasAudio);
            this.finishCurrentResponse();
        });
        
        this.socket.on('user-transcript', (data) => {
            if (data.transcript) {
                console.log('User transcript received:', data.transcript);
                
                if (!this.shownTranscripts.has(data.transcript)) {
                    // Create conversation pair wrapper
                    this.currentConversationPair = document.createElement('div');
                    this.currentConversationPair.style.marginBottom = '16px';
                    
                    const userMsg = document.createElement('div');
                    userMsg.className = 'message user';
                    userMsg.textContent = data.transcript;
                    
                    this.currentConversationPair.appendChild(userMsg);
                    this.messages.appendChild(this.currentConversationPair);
                    this.scrollToBottom();
                    
                    this.shownTranscripts.add(data.transcript);
                    
                    if (this.shownTranscripts.size > 10) {
                        const first = this.shownTranscripts.values().next().value;
                        this.shownTranscripts.delete(first);
                    }
                } else {
                    console.log('Duplicate transcript ignored:', data.transcript);
                }
            }
        });
        
        this.socket.on('realtime-disconnected', () => {
            this.handleDisconnection();
        });
        
        this.socket.on('error', (data) => {
            console.error('Socket error:', data);
            // Filter out cancellation errors as they're normal during interrupts
            if (data.message && data.message.includes('no active response')) {
                console.log('Cancellation error (normal during interrupts):', data.message);
                return;
            }
            this.updateStatus('Connection Error', data.message);
            this.connectBtn.disabled = false;
            this.addMessage('system', 'Error: ' + data.message);
        });
        
        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            this.updateStatus('Connection Failed', 'Unable to connect to server');
            this.connectBtn.disabled = false;
        });
        
        this.socket.on('admin-takeover', (data) => {
            console.log('Admin taking over conversation:', data);
            this.addMessage('system', '🎧 ' + (data.message || 'Admin is joining the conversation'));
            this.updateStatus('Connected', 'Admin is handling your request');
        });
        
        // Listen for PDF changes from admin
        this.socket.on('pdf-updated', (data) => {
            if (this.currentUser && this.currentUser.role === 'user') {
                // Remove old PDF status message
                const oldStatus = this.messages.querySelector('.pdf-status');
                if (oldStatus) oldStatus.remove();
                
                // Add new PDF status
                this.addMessage('system', `📄 Knowledge Base updated: ${data.filename}`, 'pdf-status');
            }
        });
        
        // Check if this is admin mode (taking over a session)
        const urlParams = new URLSearchParams(window.location.search);
        const adminMode = urlParams.get('mode');
        const takeoverSession = urlParams.get('session');
        
        if (adminMode === 'admin' && takeoverSession) {
            this.addMessage('system', `🎧 Admin Mode: Taking over session ${takeoverSession.substring(0, 12)}...`);
            this.updateStatus('Admin Mode', 'You are now handling this customer');
        }
    }
    
    async initializeAudio() {
        try {
            console.log('Initializing audio system...');
            
            // Initialize audio context first
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 24000,
                latencyHint: 'playback'
            });
            
            console.log('Audio context created, state:', this.audioContext.state);
            
            // Resume audio context if suspended (required by browser policies)
            if (this.audioContext.state === 'suspended') {
                console.log('Resuming suspended audio context...');
                await this.audioContext.resume();
                console.log('Audio context resumed, state:', this.audioContext.state);
            }
            
            // Initialize audio player
            this.audioPlayer = new AudioPlayer(this.audioContext);
            console.log('Audio player initialized');
            
            // Get microphone access
            console.log('Requesting microphone access...');
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
                audio: { 
                    sampleRate: 24000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } 
            });
            console.log('Microphone access granted');
            
            // Setup audio worklet for microphone processing
            await this.setupAudioWorklet();
            console.log('Audio worklet setup complete');
            
            // Test audio context by playing a silent buffer
            await this.testAudioPlayback();
            
        } catch (error) {
            console.error('Audio initialization error:', error);
            
            // Provide more specific error messages
            if (error.name === 'NotAllowedError') {
                throw new Error('Microphone access denied. Please allow microphone access and refresh.');
            } else if (error.name === 'NotFoundError') {
                throw new Error('No microphone found. Please connect a microphone and refresh.');
            } else if (error.name === 'NotSupportedError') {
                throw new Error('Audio not supported in this browser.');
            } else {
                throw new Error('Audio initialization failed: ' + error.message);
            }
        }
    }
    
    async testAudioPlayback() {
        try {
            // Create a short silent buffer to test audio playback
            const testBuffer = this.audioContext.createBuffer(1, 1024, this.audioContext.sampleRate);
            const source = this.audioContext.createBufferSource();
            source.buffer = testBuffer;
            source.connect(this.audioContext.destination);
            source.start();
            console.log('Audio playback test successful');
        } catch (error) {
            console.warn('Audio playback test failed:', error);
        }
    }
    
    async setupAudioWorklet() {
        try {
            // Create audio worklet
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            const processor = this.audioContext.createScriptProcessor(2048, 1, 1);
            
            processor.onaudioprocess = (event) => {
                if (this.isRecording && this.isConnected) {
                    const inputData = event.inputBuffer.getChannelData(0);

                    // compute mic RMS and update avatar mouth in near real-time
                    try {
                        const micLevel = this.computeRMSFromFloat32(inputData);
                        this._micLevel = micLevel;
                        if (this.debugMicEl) this.debugMicEl.textContent = `Mic level: ${micLevel.toFixed(2)}`;
                        if (this.configDebugMic) this.configDebugMic.textContent = `Mic level: ${micLevel.toFixed(2)}`;
                        this.updateAvatarMouth(micLevel);
                        
                        // Interrupt agent if user starts speaking (above threshold)
                        if (micLevel > 0.15 && !this._userSpeaking) {
                            this._userSpeaking = true;
                            console.log('User started speaking, interrupting agent');
                            this.interruptAgent();
                        } else if (micLevel < 0.08) {
                            this._userSpeaking = false;
                        }
                    } catch (e) {
                        // ignore
                    }

                    const pcm16Data = this.floatToPCM16(inputData);
                    const base64Data = this.arrayBufferToBase64(pcm16Data);
                    
                    this.socket.emit('send-audio', {
                        sessionId: this.sessionId,
                        audio: base64Data
                    });
                }
            };
            
            source.connect(processor);
            processor.connect(this.audioContext.destination);
            this.audioWorklet = processor;
            
        } catch (error) {
            console.error('Audio worklet setup error:', error);
        }
    }
    
    toggleMicrophone() {
        if (this.isRecording) {
            this.isRecording = false;
            this.micBtn.classList.remove('active');
            this.updateStatus('Connected', 'Microphone off - Type to chat');
            this.micBtn.setAttribute('aria-pressed', 'false');
            
            // Auto-focus to text input when mic is muted
            if (this.messageInput) {
                this.messageInput.focus();
            }
        } else {
            this.isRecording = true;
            this.micBtn.classList.add('active');
            this.updateStatus('Connected', 'Listening...');
            this.micBtn.setAttribute('aria-pressed', 'true');
            
            // Blur text input when mic is active
            if (this.messageInput) {
                this.messageInput.blur();
            }
        }
    }
    
    sendTextMessage() {
        const text = this.messageInput.value.trim();
        if (!text || !this.isConnected) return;
        
        // Stop audio playback gently without full interrupt
        if (this.audioPlayer) {
            this.audioPlayer.stop();
        }
        if ('speechSynthesis' in window) {
            speechSynthesis.cancel();
        }
        this.agentAvatar.classList.remove('speaking');
        this.updateAvatarMouth(0);
        
        // Create conversation pair for text message
        this.currentConversationPair = document.createElement('div');
        this.currentConversationPair.style.marginBottom = '16px';
        
        const userMsg = document.createElement('div');
        userMsg.className = 'message user';
        userMsg.textContent = text;
        
        this.currentConversationPair.appendChild(userMsg);
        this.messages.appendChild(this.currentConversationPair);
        this.scrollToBottom();
        
        this.socket.emit('send-text', {
            sessionId: this.sessionId,
            text: text
        });
        
        this.messageInput.value = '';
    }
    
    disconnect() {
        if (this.socket) {
            this.socket.emit('disconnect-realtime', { sessionId: this.sessionId });
            this.socket.disconnect();
        }
        this.handleDisconnection();
    }
    
    handleDisconnection() {
        this.isConnected = false;
        this.sessionId = null;
        
        // Clean up audio
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        
        // Reset UI
        this.updateStatus('Disconnected', 'Click connect to start');
        this.connectBtn.classList.remove('hidden');
        this.disconnectBtn.classList.add('hidden');
        this.connectBtn.disabled = false;
        this.micBtn.disabled = true;
        this.micBtn.classList.remove('active');
        this.isRecording = false;
        this.messageInput.disabled = true;
        this.sendBtn.disabled = true;
        this.agentAvatar.classList.remove('speaking');
        this.updateAvatarMouth(0);
        
        // Clean up any ongoing transcripts
        this.currentResponse = null;
        this.currentUserTranscript = null;
        
        this.addMessage('system', 'Disconnected from AI agent');
    }
    
    setupPDFHandlers() {
        this.uploadArea.addEventListener('click', () => {
            this.fileInput.click();
        });
        
        this.fileInput.addEventListener('change', (e) => {
            this.handleFileUpload(e.target.files);
        });
        
        this.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadArea.classList.add('dragover');
        });
        
        this.uploadArea.addEventListener('dragleave', () => {
            this.uploadArea.classList.remove('dragover');
        });
        
        this.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadArea.classList.remove('dragover');
            this.handleFileUpload(e.dataTransfer.files);
        });
        
        this.loadPDFList();
        
        // Auto-refresh PDF list every 10 seconds for real-time sync
        setInterval(() => {
            this.loadPDFList();
        }, 10000);
    }
    
    async loadPDFListReadOnly() {
        try {
            const response = await fetch('http://127.0.0.1:8004/list-pdfs');
            if (!response.ok) return;
            
            const data = await response.json();
            const selectedPdf = data.pdfs?.find(pdf => pdf.selected);
            
            if (selectedPdf) {
                // Show selected PDF info in chat
                const currentSelected = this.messages.querySelector('.pdf-status');
                if (!currentSelected) {
                    this.addMessage('system', `📄 Knowledge Base: ${selectedPdf.filename}`, 'pdf-status');
                }
            }
            
            // Auto-refresh for users
            if (!this.pdfRefreshInterval) {
                this.pdfRefreshInterval = setInterval(() => {
                    this.loadPDFListReadOnly();
                }, 10000);
            }
        } catch (error) {
            console.error('Error loading PDF status:', error);
        }
    }
    
    async handleFileUpload(files) {
        for (let file of files) {
            if (file.type === 'application/pdf') {
                const formData = new FormData();
                formData.append('file', file);
                
                try {
                    const response = await fetch('http://127.0.0.1:8004/upload-pdf', {
                        method: 'POST',
                        body: formData
                    });
                    
                    if (response.ok) {
                        this.addMessage('system', `PDF uploaded: ${file.name}`);
                        this.loadPDFList();
                    } else {
                        this.addMessage('system', `Failed to upload: ${file.name}`);
                    }
                } catch (error) {
                    console.error('Upload error:', error);
                    this.addMessage('system', `Upload error: ${file.name}`);
                }
            }
        }
    }
    
    async loadPDFList() {
        try {
            const response = await fetch('http://127.0.0.1:8004/list-pdfs');
            if (!response.ok) {
                console.error('Failed to load PDFs:', response.status);
                return;
            }
            
            const data = await response.json();
            
            this.pdfList.innerHTML = '';
            if (data.pdfs && data.pdfs.length > 0) {
                data.pdfs.forEach(pdf => {
                    const item = document.createElement('div');
                    item.className = 'pdf-item';
                    if (pdf.selected) item.classList.add('selected');
                    item.textContent = pdf.filename || pdf.name || 'Unknown PDF';
                    item.onclick = () => this.selectPDF(pdf.id || pdf.filename, item);
                    this.pdfList.appendChild(item);
                });
            } else {
                const noFiles = document.createElement('div');
                noFiles.className = 'pdf-item';
                noFiles.textContent = 'No PDFs uploaded yet';
                noFiles.style.opacity = '0.5';
                this.pdfList.appendChild(noFiles);
            }
        } catch (error) {
            console.error('Error loading PDF list:', error);
            const errorItem = document.createElement('div');
            errorItem.className = 'pdf-item';
            errorItem.textContent = 'Error loading PDFs';
            errorItem.style.color = '#f87171';
            this.pdfList.appendChild(errorItem);
        }
    }
    
    async selectPDF(pdfId, element) {
        try {
            const response = await fetch('http://127.0.0.1:8004/select-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pdf_id: pdfId })
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                document.querySelectorAll('.pdf-item').forEach(item => {
                    item.classList.remove('selected');
                });
                element.classList.add('selected');
                this.addMessage('system', `PDF selected: ${element.textContent}`);
                
                // Notify all users about PDF change
                this.broadcastPDFChange(element.textContent);
            } else {
                this.addMessage('system', 'Failed to select PDF: ' + (result.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error selecting PDF:', error);
            this.addMessage('system', 'Error selecting PDF');
        }
    }
    
    updateStatus(title, subtitle) {
        this.statusTitle.textContent = title;
        this.statusSubtitle.textContent = subtitle;
    }
    
    addMessage(type, content, extraClass = '') {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type} ${extraClass}`;
        messageDiv.textContent = content;
        this.messages.appendChild(messageDiv);
        this.scrollToBottom();
    }
    
    startNewResponse() {
        this.currentResponse = document.createElement('div');
        this.currentResponse.className = 'message agent';
        this.currentResponse.textContent = '';
        this.currentResponseHasAudio = false;
        
        // Add to current conversation pair if exists, otherwise add directly
        if (this.currentConversationPair) {
            this.currentConversationPair.appendChild(this.currentResponse);
        } else {
            this.messages.appendChild(this.currentResponse);
        }
        this.scrollToBottom();
    }
    
    startNewUserTranscript() {
        // Only create new transcript if not already transcribing
        if (!this.currentUserTranscript) {
            this.currentUserTranscript = document.createElement('div');
            this.currentUserTranscript.className = 'message user transcribing';
            this.currentUserTranscript.textContent = '';
            this.messages.appendChild(this.currentUserTranscript);
            this.scrollToBottom();
        }
    }
    
    appendToCurrentUserTranscript(text) {
        if (this.currentUserTranscript) {
            this.currentUserTranscript.textContent += text;
            this.scrollToBottom();
        }
    }
    
    finishCurrentUserTranscript() {
        if (this.currentUserTranscript) {
            // Remove transcribing class to finalize the message
            this.currentUserTranscript.classList.remove('transcribing');
            this.currentUserTranscript = null;
        }
    }
    
    appendToCurrentResponse(text) {
        if (this.currentResponse) {
            this.currentResponse.textContent += text;
            this.scrollToBottom();
        }
    }
    
    formatAgentMessage(element) {
        let text = element.textContent;
        
        // Clean up HTML entities
        text = text.replace(/&amp;/g, '&');
        text = text.replace(/&quot;/g, '"');
        
        // Bold for "seharga" pattern
        text = text.replace(/\b([A-Z][\w\s&]+?)\s+seharga\s+(\d+[\s,.]?\d*\s*ribu)/gi, 
            '<strong>$1</strong> seharga <strong>$2</strong>');
        
        // Bold for "dengan harga" pattern
        text = text.replace(/\b([A-Z][\w\s&]+?)\s+dengan harga\s+(\d+[\s,.]?\d*\s*ribu)/gi, 
            '<strong>$1</strong> dengan harga <strong>$2</strong>');
        
        // Bold for "harganya" pattern
        text = text.replace(/\b([A-Z][\w\s&]+?)\s+harganya\s+(\d+[\s,.]?\d*\s*ribu)/gi, 
            '<strong>$1</strong> harganya <strong>$2</strong>');
        
        // Bold menu items with colon and price
        text = text.replace(/([\-•]?\s*)([A-Z][\w\s&]+?):\s*(Rp\s*)?([\d,]+\s*ribu)/gi, 
            '$1<strong>$2</strong>: <strong>$4</strong>');
        
        // Add line breaks for better readability
        text = text.replace(/\n/g, '<br>');
        
        element.innerHTML = text.trim();
    }
    
    scrollToBottom() {
        setTimeout(() => {
            this.messages.scrollTop = this.messages.scrollHeight;
        }, 10);
    }
    
    debugMessageOrder() {
        const messages = this.messages.querySelectorAll('.message');
        console.log('Current message order:');
        messages.forEach((msg, index) => {
            const type = msg.classList.contains('user') ? 'USER' : 
                        msg.classList.contains('agent') ? 'AGENT' : 'SYSTEM';
            console.log(`${index + 1}. ${type}: ${msg.textContent.substring(0, 50)}...`);
        });
    }
    
    // Function to ensure correct message chronological order
    ensureMessageOrder() {
        const messages = Array.from(this.messages.querySelectorAll('.message'));
        
        // Add timestamps if not present
        messages.forEach((msg, index) => {
            if (!msg.dataset.timestamp) {
                msg.dataset.timestamp = Date.now() + index;
            }
        });
        
        // Sort by timestamp
        messages.sort((a, b) => {
            return parseInt(a.dataset.timestamp) - parseInt(b.dataset.timestamp);
        });
        
        // Clear and re-append in correct order
        this.messages.innerHTML = '';
        messages.forEach(msg => {
            this.messages.appendChild(msg);
        });
        
        this.scrollToBottom();
    }
    
    async finishCurrentResponse() {
        // Format the complete response text ONCE after it's finished
        if (this.currentResponse) {
            this.formatAgentMessage(this.currentResponse);
        }
        
        // if the response had no audio frames, use speechSynthesis fallback to speak text
        try {
            if (this.currentResponse && !this.currentResponseHasAudio) {
                const text = this.currentResponse.textContent || '';
                if (text.trim().length > 0) {
                    console.log('No audio received, using speech synthesis for:', text.substring(0, 50) + '...');
                    await this.speakTextFallback(text);
                } else {
                    console.log('No text content to speak');
                }
            } else if (this.currentResponseHasAudio) {
                console.log('Audio was received and should have been played');
            }
        } catch (e) {
            console.error('Error in finishCurrentResponse:', e);
        }

        // Reset for next response
        this.currentResponse = null;
        this.currentResponseHasAudio = false;
    }
    
    broadcastPDFChange(filename) {
        // Send notification to server about PDF change
        if (this.socket && this.isConnected) {
            this.socket.emit('pdf-changed', {
                filename: filename,
                timestamp: new Date().toISOString()
            });
        }
    }

    // Enhanced speech synthesis fallback with better voice selection
    async speakTextFallback(text) {
        if (!('speechSynthesis' in window)) {
            console.warn('Speech synthesis not supported');
            return;
        }

        try {
            // Stop any current speech
            speechSynthesis.cancel();
            
            // Wait for voices to load if needed
            let voices = speechSynthesis.getVoices();
            if (voices.length === 0) {
                await new Promise(resolve => {
                    speechSynthesis.onvoiceschanged = () => {
                        voices = speechSynthesis.getVoices();
                        resolve();
                    };
                    // Fallback timeout
                    setTimeout(resolve, 1000);
                });
            }

            // Get emotion parameters from backend or use heuristics
            let pitch = 1.0;
            let rate = 0.9; // Slightly slower for better clarity
            let volume = 0.8;
            
            try {
                const resp = await fetch('http://127.0.0.1:8004/analyze-emotion', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text })
                });
                if (resp.ok) {
                    const json = await resp.json();
                    if (json && typeof json.pitch === 'number') pitch = json.pitch;
                    if (json && typeof json.rate === 'number') rate = json.rate;
                }
            } catch (e) {
                // Use keyword-based heuristics
                const lower = text.toLowerCase();
                if (lower.includes('sorry') || lower.includes('maaf') || lower.includes('apolog')) {
                    pitch = 0.9; rate = 0.85;
                } else if (lower.includes('congrat') || lower.includes('selamat') || lower.includes('great') || lower.includes('bagus')) {
                    pitch = 1.1; rate = 1.0;
                } else if (lower.includes('important') || lower.includes('penting') || lower.includes('urgent')) {
                    pitch = 1.0; rate = 0.9;
                } else if (lower.includes('halo') || lower.includes('hello') || lower.includes('hi')) {
                    pitch = 1.05; rate = 0.95;
                }
            }

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = Math.max(0.5, Math.min(2.0, rate));
            utterance.pitch = Math.max(0.5, Math.min(2.0, pitch));
            utterance.volume = volume;
            
            // Select best available voice
            if (voices && voices.length > 0) {
                // Prefer Indonesian voices, then English, then any available
                const preferred = voices.find(v => 
                    v.lang.includes('id') || v.name.toLowerCase().includes('indonesia')
                ) || voices.find(v => 
                    v.lang.includes('en') || v.name.toLowerCase().includes('english')
                ) || voices.find(v => 
                    v.name.toLowerCase().includes('google') || v.name.toLowerCase().includes('microsoft')
                ) || voices[0];
                
                utterance.voice = preferred;
                console.log('Using voice:', preferred.name, 'Language:', preferred.lang);
            }

            // Add event listeners for debugging
            utterance.onstart = () => {
                console.log('Speech synthesis started');
                this.agentAvatar.classList.add('speaking');
            };
            
            utterance.onend = () => {
                console.log('Speech synthesis ended');
                this.agentAvatar.classList.remove('speaking');
                this.updateAvatarMouth(0);
            };
            
            utterance.onerror = (event) => {
                console.error('Speech synthesis error:', event.error);
                this.agentAvatar.classList.remove('speaking');
                this.updateAvatarMouth(0);
            };

            // Simulate mouth movement during speech synthesis
            let mouthInterval;
            utterance.onstart = () => {
                console.log('Speech synthesis started');
                this.agentAvatar.classList.add('speaking');
                
                // Simulate mouth movement
                mouthInterval = setInterval(() => {
                    const level = 0.3 + Math.random() * 0.4; // Random mouth movement
                    this.updateAvatarMouth(level);
                }, 100);
            };
            
            utterance.onend = utterance.onerror = () => {
                console.log('Speech synthesis ended');
                this.agentAvatar.classList.remove('speaking');
                this.updateAvatarMouth(0);
                if (mouthInterval) {
                    clearInterval(mouthInterval);
                }
            };

            speechSynthesis.speak(utterance);
            
        } catch (error) {
            console.error('Speech synthesis error:', error);
            this.addMessage('system', 'Text-to-speech failed: ' + error.message);
        }
    }
    
    // Audio utility functions
    floatToPCM16(float32Array) {
        const pcm16Array = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
            const sample = Math.max(-1, Math.min(1, float32Array[i]));
            pcm16Array[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        }
        return pcm16Array.buffer;
    }
    
    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }
    
    base64ToArrayBuffer(base64) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }
    
    // Compute RMS (0..1) from Float32Array audio samples (microphone input)
    computeRMSFromFloat32(float32Array) {
        let sum = 0;
        const len = float32Array.length;
        if (!len) return 0;
        for (let i = 0; i < len; i++) {
            const v = float32Array[i];
            sum += v * v;
        }
        const rms = Math.sqrt(sum / len);
        // scale a bit for visible movement
        return Math.min(1, rms * 6);
    }

    // Compute RMS (0..1) from Int16 PCM ArrayBuffer (incoming audio)
    computeRMSFromPCM16(arrayBuffer) {
        const view = new Int16Array(arrayBuffer);
        let sum = 0;
        const len = view.length;
        if (!len) return 0;
        for (let i = 0; i < len; i++) {
            const v = view[i] / 32768; // normalize to -1..1
            sum += v * v;
        }
        const rms = Math.sqrt(sum / len);
        return Math.min(1, rms * 6);
    }

    // Smooth and apply avatar mouth transform. level expected 0..1
    interruptAgent() {
        console.log('Interrupting agent due to user speech');
        
        // Stop audio playback immediately
        if (this.audioPlayer) {
            this.audioPlayer.stop();
        }
        
        // Stop speech synthesis immediately
        if ('speechSynthesis' in window) {
            speechSynthesis.cancel();
        }
        
        // Remove speaking state and reset mouth
        this.agentAvatar.classList.remove('speaking');
        this.updateAvatarMouth(0);
        
        // Clear any ongoing response display
        if (this.currentResponse) {
            // Mark current response as interrupted
            this.currentResponse.style.opacity = '0.7';
        }
        
        // Send interrupt signal to server
        if (this.socket && this.isConnected) {
            this.socket.emit('interrupt', { sessionId: this.sessionId });
        }
    }
    
    updateAvatarMouth(level) {
        try {
            level = Math.max(0, Math.min(1, level || 0));
            if (this._avatarMouthLevel == null) this._avatarMouthLevel = 0;
            // responsiveness r in [0..1] determines how much of the new sample is applied
            const r = (typeof this.mouthResponsiveness === 'number') ? this.mouthResponsiveness : 0.3;
            const smooth = this._avatarMouthLevel * (1 - r) + level * r;
            this._avatarMouthLevel = smooth;

            const mouth = document.getElementById('avatarMouth');
            if (mouth) {
                const sensitivity = (typeof this.mouthSensitivity === 'number') ? this.mouthSensitivity : 1.0;
                const scaleY = Math.max(0.2, Math.min(3.0, 1 + smooth * 0.8 * sensitivity));
                mouth.style.transform = `scaleY(${scaleY})`;
            }
        } catch (e) {
            // silent fail
        }
    }
    
    playAudio(audioData) {
        if (this.audioPlayer && audioData) {
            try {
                // Ensure audio context is running before playing
                if (this.audioContext && this.audioContext.state === 'suspended') {
                    this.audioContext.resume().then(() => {
                        this.audioPlayer.play(audioData);
                    }).catch(error => {
                        console.error('Failed to resume audio context:', error);
                        this.fallbackToSpeechSynthesis();
                    });
                } else {
                    this.audioPlayer.play(audioData);
                }
            } catch (error) {
                console.error('Audio playback error:', error);
                this.fallbackToSpeechSynthesis();
            }
        } else {
            console.warn('Audio player not available, using speech synthesis fallback');
            this.fallbackToSpeechSynthesis();
        }
    }
    
    fallbackToSpeechSynthesis() {
        try {
            if (this.currentResponse && this.currentResponse.textContent) {
                const text = this.currentResponse.textContent.trim();
                if (text) {
                    console.log('Using speech synthesis fallback for:', text.substring(0, 50) + '...');
                    this.speakTextFallback(text);
                }
            }
        } catch (error) {
            console.error('Speech synthesis fallback failed:', error);
        }
    }
}

class AudioPlayer {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.audioQueue = [];
        this.isPlaying = false;
        this.nextStartTime = 0;
        this.gainNode = null;
        this.setupAudioNodes();
    }
    
    setupAudioNodes() {
        try {
            this.gainNode = this.audioContext.createGain();
            this.gainNode.connect(this.audioContext.destination);
            this.gainNode.gain.value = 0.8; // Slightly lower volume to prevent clipping
        } catch (error) {
            console.warn('Failed to setup audio nodes:', error);
        }
    }
    
    async ensureAudioContextRunning() {
        if (this.audioContext.state === 'suspended') {
            try {
                await this.audioContext.resume();
                console.log('Audio context resumed');
            } catch (error) {
                console.error('Failed to resume audio context:', error);
                throw error;
            }
        }
    }
    
    play(audioData) {
        this.audioQueue.push(audioData);
        if (!this.isPlaying) {
            this.processQueue();
        }
    }
    
    async processQueue() {
        if (this.audioQueue.length === 0) {
            this.isPlaying = false;
            return;
        }
        
        this.isPlaying = true;
        const audioData = this.audioQueue.shift();
        
        try {
            await this.ensureAudioContextRunning();
            
            let audioBuffer;
            
            // Try multiple decoding strategies
            try {
                // Strategy 1: Try as compressed audio (WAV/MP3/OGG)
                audioBuffer = await this.audioContext.decodeAudioData(audioData.slice());
                console.log('Successfully decoded as compressed audio');
            } catch (decodeError) {
                console.log('Compressed audio decode failed, trying PCM16:', decodeError.message);
                
                // Strategy 2: Try as raw PCM16
                try {
                    audioBuffer = await this.createAudioBufferFromPCM16(audioData, 24000);
                    console.log('Successfully decoded as PCM16');
                } catch (pcmError) {
                    console.log('PCM16 decode failed, trying alternative sample rates:', pcmError.message);
                    
                    // Strategy 3: Try different sample rates
                    const sampleRates = [22050, 16000, 44100, 48000];
                    let success = false;
                    
                    for (const rate of sampleRates) {
                        try {
                            audioBuffer = await this.createAudioBufferFromPCM16(audioData, rate);
                            console.log(`Successfully decoded as PCM16 at ${rate}Hz`);
                            success = true;
                            break;
                        } catch (e) {
                            continue;
                        }
                    }
                    
                    if (!success) {
                        throw new Error('All decoding strategies failed');
                    }
                }
            }
            
            // Play the audio buffer
            await this.playAudioBuffer(audioBuffer);
            
        } catch (error) {
            console.error('Audio playback error:', error);
            
            // Try fallback to speech synthesis
            try {
                if (window.appInstance && window.appInstance.currentResponse) {
                    const text = window.appInstance.currentResponse.textContent;
                    if (text && text.trim()) {
                        console.log('Falling back to speech synthesis');
                        await window.appInstance.speakTextFallback(text);
                    }
                }
            } catch (fallbackError) {
                console.error('Speech synthesis fallback failed:', fallbackError);
            }
            
            // Show user-friendly error
            if (window.appInstance && window.appInstance.addMessage) {
                window.appInstance.addMessage('system', 'Audio playback error - using text-to-speech fallback');
            }
        }
        
        // Continue processing queue
        setTimeout(() => this.processQueue(), 50);
    }
    
    async playAudioBuffer(audioBuffer) {
        return new Promise((resolve, reject) => {
            try {
                const source = this.audioContext.createBufferSource();
                source.buffer = audioBuffer;
                
                // Connect through gain node if available
                if (this.gainNode) {
                    source.connect(this.gainNode);
                } else {
                    source.connect(this.audioContext.destination);
                }
                
                // Calculate when to start this buffer
                const now = this.audioContext.currentTime;
                const startTime = Math.max(now + 0.01, this.nextStartTime);
                this.nextStartTime = startTime + audioBuffer.duration;
                
                source.onended = () => {
                    resolve();
                };
                
                source.onerror = (error) => {
                    reject(error);
                };
                
                source.start(startTime);
                
                // Cleanup next start time if it gets too far ahead
                if (this.nextStartTime - now > 2.0) {
                    this.nextStartTime = now + audioBuffer.duration;
                }
                
            } catch (error) {
                reject(error);
            }
        });
    }

    async createAudioBufferFromPCM16(arrayBuffer, sampleRate = 24000) {
        try {
            // Ensure we have a proper ArrayBuffer
            let buffer;
            if (arrayBuffer instanceof ArrayBuffer) {
                buffer = arrayBuffer;
            } else if (ArrayBuffer.isView(arrayBuffer)) {
                buffer = arrayBuffer.buffer.slice(arrayBuffer.byteOffset, arrayBuffer.byteOffset + arrayBuffer.byteLength);
            } else {
                throw new Error('Invalid audio data format');
            }
            
            // Ensure even byte length for 16-bit samples
            const byteLength = buffer.byteLength;
            if (byteLength === 0) {
                throw new Error('Empty audio buffer');
            }
            
            const adjustedLength = byteLength - (byteLength % 2);
            const samples = adjustedLength / 2;
            
            if (samples === 0) {
                throw new Error('No audio samples found');
            }
            
            // Create AudioBuffer
            const audioBuffer = this.audioContext.createBuffer(1, samples, sampleRate);
            const channelData = audioBuffer.getChannelData(0);
            
            // Convert PCM16 to float32
            const dataView = new DataView(buffer, 0, adjustedLength);
            for (let i = 0; i < samples; i++) {
                const sample = dataView.getInt16(i * 2, true); // little-endian
                channelData[i] = Math.max(-1, Math.min(1, sample / 32768));
            }
            
            // Resample if needed
            const targetSampleRate = this.audioContext.sampleRate;
            if (Math.abs(sampleRate - targetSampleRate) > 100) {
                return await this.resampleAudioBuffer(audioBuffer, targetSampleRate);
            }
            
            return audioBuffer;
            
        } catch (error) {
            console.error('PCM16 conversion error:', error);
            throw error;
        }
    }
    
    async resampleAudioBuffer(sourceBuffer, targetSampleRate) {
        try {
            const sourceSampleRate = sourceBuffer.sampleRate;
            const sourceLength = sourceBuffer.length;
            const targetLength = Math.round(sourceLength * targetSampleRate / sourceSampleRate);
            
            const offlineContext = new OfflineAudioContext(1, targetLength, targetSampleRate);
            const source = offlineContext.createBufferSource();
            source.buffer = sourceBuffer;
            source.connect(offlineContext.destination);
            source.start(0);
            
            const resampledBuffer = await offlineContext.startRendering();
            console.log(`Resampled from ${sourceSampleRate}Hz to ${targetSampleRate}Hz`);
            return resampledBuffer;
            
        } catch (error) {
            console.warn('Resampling failed, using original buffer:', error);
            return sourceBuffer;
        }
    }
    
    stop() {
        this.audioQueue = [];
        this.isPlaying = false;
        this.nextStartTime = this.audioContext.currentTime;
    }
}

// Initialize the playground when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const inst = new RealtimePlayground();
    // expose instance for debugging in browser console
    try { window.appInstance = inst; } catch (e) {}
});