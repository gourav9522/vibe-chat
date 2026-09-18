const express = require('express');
const axios = require('axios');
const cron = require('node-cron');
const multer = require('multer');
const FormData = require('form-data');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Manual CORS Headers
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.json());

// Multiple Telegram Accounts (Round-robin rotation for APKs)
const TELEGRAM_ACCOUNTS = [
    {
        botToken: '8953260237:AAGeFUzkNOzhQ8dthA00K81cgXwI8ZqkY90',
        chatId: '-1003935579226',
        accountName: 'Telegram Account 1'
    },
    {
        botToken: 'YAHAN_DOOSRE_BOT_KA_TOKEN_DAAL',
        chatId: 'YAHAN_DOOSRE_CHAT_ID_DAAL',
        accountName: 'Telegram Account 2'
    }
];

let currentAccountIndex = 0;

app.get('/ping', (req, res) => {
    res.send('Pong! Server is active.');
});

// Sirf APK upload handle karega (No Server-side Internet Archive load)
app.post('/api/upload-apk', upload.single('apkFile'), async (req, res) => {
    try {
        const activeAccount = TELEGRAM_ACCOUNTS[currentAccountIndex];
        currentAccountIndex = (currentAccountIndex + 1) % TELEGRAM_ACCOUNTS.length;

        const token = activeAccount.botToken;
        const chatId = activeAccount.chatId;

        const apkFile = req.file;
        if (!apkFile) return res.status(400).json({ success: false, error: "APK file missing" });

        // Upload APK to Telegram
        const apkFormData = new FormData();
        apkFormData.append('chat_id', chatId);
        apkFormData.append('document', apkFile.buffer, apkFile.originalname);

        const apkRes = await axios.post(`https://api.telegram.org/bot${token}/sendDocument`, apkFormData, {
            headers: apkFormData.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        if (!apkRes.data.ok) throw new Error("Telegram APK upload failed");
        const doc = apkRes.data.result.document;
        const filePatRes = await axios.get(`https://api.telegram.org/bot${token}/getFile?file_id=${doc.file_id}`);
        const directDownloadUrl = `https://api.telegram.org/file/bot${token}/${filePatRes.data.result.file_path}`;

        res.json({
            success: true,
            downloadUrl: directDownloadUrl,
            uploadedAccount: activeAccount.accountName
        });

    } catch (err) {
        console.error("Upload Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    const SERVER_URL = process.env.RENDER_EXTERNAL_URL || 'https://download-link-server.onrender.com';
    
    setInterval(() => {
        axios.get(`${SERVER_URL}/ping`)
            .then(() => console.log('Self-ping successful: Server is awake.'))
            .catch((err) => console.error('Self-ping failed:', err.message));
    }, 4 * 60 * 1000);
});
