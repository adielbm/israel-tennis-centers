#!/bin/bash

# Setup script for Cloudflare Worker KV namespace

echo "🚀 Setting up Cloudflare Worker KV namespace..."
echo ""

cd api

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found. Installing..."
    npm install -g wrangler
fi

echo "📦 Creating KV namespace for court availability cache..."
echo ""

# Create the KV namespace
OUTPUT=$(npx wrangler kv namespace create "COURTS_CACHE" 2>&1)

echo "$OUTPUT"
echo ""

# Extract the namespace ID from the output
NAMESPACE_ID=$(echo "$OUTPUT" | grep -oE 'id = "[a-z0-9]+"' | grep -oE '[a-z0-9]{32}')

if [ -z "$NAMESPACE_ID" ]; then
    echo "⚠️  Could not automatically extract namespace ID."
    echo "Please manually update wrangler.toml with the ID shown above."
    exit 1
fi

echo "✅ Namespace created with ID: $NAMESPACE_ID"
echo ""
echo "📝 Updating wrangler.toml..."

# Update wrangler.toml with the actual namespace ID
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s/YOUR_KV_NAMESPACE_ID/$NAMESPACE_ID/" wrangler.toml
else
    # Linux
    sed -i "s/YOUR_KV_NAMESPACE_ID/$NAMESPACE_ID/" wrangler.toml
fi

echo "✅ wrangler.toml updated successfully!"
echo ""
echo "🎉 Setup complete! You can now deploy with: npm run deploy"
