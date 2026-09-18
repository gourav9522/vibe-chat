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

// Multiple Telegram Accounts (Round-robin rotation)
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

app.post('/api/upload-apk', upload.fields([
    { name: 'apkFile' }, 
    { name: 'logoFile' }, 
    { name: 'screenshotFiles' }
]), async (req, res) => {
    try {
        const activeAccount = TELEGRAM_ACCOUNTS[currentAccountIndex];
        currentAccountIndex = (currentAccountIndex + 1) % TELEGRAM_ACCOUNTS.length;

        const token = activeAccount.botToken;
        const chatId = activeAccount.chatId;

        const apkFile = req.files['apkFile'] ? req.files['apkFile'][0] : null;
        const logoFile = req.files['logoFile'] ? req.files['logoFile'][0] : null;
        const screenshotFiles = req.files['screenshotFiles'] || [];

        if (!apkFile) return res.status(400).json({ success: false, error: "APK file missing" });

        // Helper function to upload any file (Document or Photo) to Telegram and get direct URL
        const uploadToTelegram = async (file, isPhoto = false) => {
            const formData = new FormData();
            formData.append('chat_id', chatId);
            formData.append(isPhoto ? 'photo' : 'document', file.buffer, file.originalname);

            const endpoint = isPhoto ? 'sendPhoto' : 'sendDocument';
            const response = await axios.post(`https://api.telegram.org/bot${token}/${endpoint}`, formData, {
                headers: formData.getHeaders(),
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            });

            if (!response.data.ok) throw new Error("Telegram upload failed");
            
            const resultObj = isPhoto ? response.data.result.photo[response.data.result.photo.length - 1] : response.data.result.document;
            const fileId = resultObj.file_id;

            const pathRes = await axios.get(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
            return `https://api.telegram.org/file/bot${token}/${pathRes.data.result.file_path}`;
        };

        // 1. Upload APK to Telegram
        const directDownloadUrl = await uploadToTelegram(apkFile, false);

        // 2. Upload Logo to Telegram (as Photo)
        let logoUrl = "";
        if (logoFile) {
            try {
                logoUrl = await uploadToTelegram(logoFile, true);
            } catch (err) {
                console.error("Logo Upload Error:", err.message);
            }
        }

        // 3. Upload Screenshots to Telegram (as Photos)
        let screenshotsUrls = [];
        for (let sFile of screenshotFiles) {
            try {
                const sUrl = await uploadToTelegram(sFile, true);
                screenshotsUrls.push(sUrl);
            } catch (err) {
                console.error("Screenshot Upload Error:", err.message);
            }
        }

        // Return links to client so it can save to Firebase and design the page
        res.json({
            success: true,
            downloadUrl: directDownloadUrl,
            logoUrl: logoUrl,
            screenshots: screenshotsUrls,
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
    
    // Auto ping every 4 minutes to keep server awake
    setInterval(() => {
        axios.get(`${SERVER_URL}/ping`)
            .then(() => console.log('Self-ping successful: Server is awake.'))
            .catch((err) => console.error('Self-ping failed:', err.message));
    }, 4 * 60 * 1000);
});
