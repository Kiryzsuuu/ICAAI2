#!/bin/bash

# Azure App Service deployment script for Node.js

echo "Starting deployment..."

# Install Node.js dependencies
echo "Installing Node.js dependencies..."
npm install --production

# Build if needed (uncomment if you have build step)
# npm run build

echo "Deployment complete!"
