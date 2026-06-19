// Vercel API Route: /api/google
// Proxy to Google Apps Script Web App
// Set GAS_WEB_APP_URL in Vercel environment variables

export default async function handler(req, res) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        return res.status(200).end();
    }

    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const gasUrl = process.env.GAS_WEB_APP_URL;

    if (!gasUrl) {
        return res.status(500).json({
            error: 'GAS_WEB_APP_URL environment variable is not set',
            message: 'Please set it in Vercel Dashboard > Settings > Environment Variables'
        });
    }

    try {
        const fetchOptions = {
            method: req.method,
            headers: {
                'Content-Type': 'application/json',
            },
        };

        if (req.method === 'POST' && req.body) {
            fetchOptions.body = JSON.stringify(req.body);
        }

        const response = await fetch(gasUrl, fetchOptions);
        const data = await response.json();

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-store');

        return res.status(response.status).json(data);
    } catch (error) {
        console.error('GAS proxy error:', error);
        return res.status(502).json({
            error: 'Failed to reach Google Apps Script',
            message: error.message
        });
    }
}
