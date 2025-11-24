#!/bin/bash

# Azure App Service startup script for Python backend

echo "Starting Python backend..."
echo "Current directory: $(pwd)"

# Change to correct directory
cd /home/site/wwwroot

# Install dependencies
echo "Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# Start application with gunicorn
echo "Starting Gunicorn server..."
gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app --bind 0.0.0.0:8000
