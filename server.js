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

const TELEGRAM_ACCOUNTS = [
    {
        botToken: '8953260237:AAGeFUzkNOzhQ8dthA00K81cgXwI8ZqkY90',
        chatId: '-1003935579226',
        accountName: 'Account 1'
    }
];

// Internet Archive Credentials
const IA_ACCESS_KEY = 'JyyV5luXiOGFzTCX';
const IA_SECRET_KEY = 'OLmzxUOSjra7c5Mh';

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

        // 1. Upload APK to Telegram
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

        const iaItemName = `apklayer-assets-${Date.now()}`;

        // 2. Upload Logo to Internet Archive
        let logoUrl = "";
        if (logoFile) {
            try {
                const logoFileName = `logo_${Date.now()}_${logoFile.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
                const iaLogoUrl = `https://s3.us.archive.org/${iaItemName}/${logoFileName}`;
                
                await axios.put(iaLogoUrl, logoFile.buffer, {
                    headers: {
                        'Authorization': `LOW ${IA_ACCESS_KEY}:${IA_SECRET_KEY}`,
                        'x-amz-auto-create-bucket': 'true',
                        'Content-Type': logoFile.mimetype
                    },
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity
                });

                logoUrl = `https://archive.org/download/${iaItemName}/${logoFileName}`;
            } catch (logoErr) {
                console.error("Internet Archive Logo Upload Error:", logoErr.message);
            }
        }

        // 3. Upload Screenshots to Internet Archive
        let screenshotsUrls = [];
        for (let i = 0; i < screenshotFiles.length; i++) {
            const sFile = screenshotFiles[i];
            try {
                const sFileName = `ss_${i}_${Date.now()}_${sFile.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
                const iaSSUrl = `https://s3.us.archive.org/${iaItemName}/${sFileName}`;

                await axios.put(iaSSUrl, sFile.buffer, {
                    headers: {
                        'Authorization': `LOW ${IA_ACCESS_KEY}:${IA_SECRET_KEY}`,
                        'x-amz-auto-create-bucket': 'true',
                        'Content-Type': sFile.mimetype
                    },
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity
                });

                screenshotsUrls.push(`https://archive.org/download/${iaItemName}/${sFileName}`);
            } catch (sErr) {
                console.error("Internet Archive Screenshot Upload Error:", sErr.message);
            }
        }

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
    console.log(`Telegram Storage Server running on port ${PORT}`);
    const SERVER_URL = process.env.RENDER_EXTERNAL_URL || 'https://download-link-server.onrender.com';
    
    // Auto ping every 4 minutes (4 * 60 * 1000 ms) to keep server awake
    setInterval(() => {
        axios.get(`${SERVER_URL}/ping`)
            .then(() => console.log('Self-ping successful: Server is awake.'))
            .catch((err) => console.error('Self-ping failed:', err.message));
    }, 4 * 60 * 1000);
});
