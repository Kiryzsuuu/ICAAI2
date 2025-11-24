#!/bin/bash

# Ensure we're in the right directory
cd /home/site/wwwroot

# Install dependencies if not already installed
if [ ! -d "node_modules" ]; then
    echo "Installing Node.js dependencies..."
    npm install --production
fi

# Start the application
echo "Starting application..."
node server.js
