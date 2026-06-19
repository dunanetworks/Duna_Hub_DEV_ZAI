// Vercel API Route: /api/config
// Serves Firebase configuration from environment variables
// Set these in Vercel Dashboard > Project > Settings > Environment Variables

export default function handler(req, res) {
    // Allow only GET requests
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const firebaseConfig = {
        apiKey: process.env.FIREBASE_API_KEY || '',
        authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
        databaseURL: process.env.FIREBASE_DATABASE_URL || '',
        projectId: process.env.FIREBASE_PROJECT_ID || '',
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
        appId: process.env.FIREBASE_APP_ID || '',
        measurementId: process.env.FIREBASE_MEASUREMENT_ID || ''
    };

    // Validate that required fields exist
    if (!firebaseConfig.apiKey || !firebaseConfig.databaseURL) {
        return res.status(500).json({
            error: 'Firebase configuration is incomplete',
            message: 'Please set FIREBASE_API_KEY and FIREBASE_DATABASE_URL environment variables in Vercel'
        });
    }

    // CORS headers for your domain
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

    res.status(200).json(firebaseConfig);
}
