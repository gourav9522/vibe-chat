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

// Multi-Telegram Accounts Configuration (Bari-bari se upload karne ke liye)
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
    },
    {
        botToken: 'YAHAN_TEESRE_BOT_KA_TOKEN_DAAL',
        chatId: 'YAHAN_TEESRE_CHAT_ID_DAAL',
        accountName: 'Telegram Account 3'
    }
];

// Internet Archive Credentials
const IA_ACCESS_KEY = 'JyyV5luXiOGFzTCX';
const IA_SECRET_KEY = 'OLmzxUOSjra7c5Mh';

const FIREBASE_DB_URL = "https://apk-layer-default-rtdb.firebaseio.com/apps.json";

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
        // Rotate to next account for next upload
        currentAccountIndex = (currentAccountIndex + 1) % TELEGRAM_ACCOUNTS.length;

        const token = activeAccount.botToken;
        const chatId = activeAccount.chatId;

        const apkFile = req.files['apkFile'] ? req.files['apkFile'][0] : null;
        const logoFile = req.files['logoFile'] ? req.files['logoFile'][0] : null;
        const screenshotFiles = req.files['screenshotFiles'] || [];

        if (!apkFile) return res.status(400).json({ success: false, error: "APK file missing" });

        // 1. Upload APK to Current Telegram Account
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

// 24-Hour Automated Link Health Checker & Alert System
async function checkAllAppLinks() {
    console.log('Running 24-hour automated app download links health check...');
    try {
        const response = await axios.get(FIREBASE_DB_URL);
        const apps = response.data;
        if (!apps) return;

        let alertIndex = 0;

        for (const appId in apps) {
            const app = apps[appId];
            if (app && app.archiveUrl && app.archiveUrl.startsWith('http')) {
                try {
                    // Head/Get request to verify if link is working
                    await axios.head(app.archiveUrl, { timeout: 10000 });
                } catch (linkErr) {
                    console.warn(`Dead link detected for app: ${app.appName}`);
                    
                    // Route alert to next Telegram account in rotation
                    const targetAccount = TELEGRAM_ACCOUNTS[alertIndex % TELEGRAM_ACCOUNTS.length];
                    alertIndex++;

                    const alertMessage = `⚠️ *DEAD LINK ALERT!*\n\n` +
                                         `📱 *App Name:* ${app.appName}\n` +
                                         `📦 *Package:* ${app.packageName}\n` +
                                         `❌ Link is broken or inaccessible! Please re-upload.`;

                    await axios.post(`https://api.telegram.org/bot${targetAccount.botToken}/sendMessage`, {
                        chat_id: targetAccount.chatId,
                        text: alertMessage,
                        parse_mode: 'Markdown'
                    }).catch(err => console.error("Failed to send telegram alert:", err.message));
                }
            }
        }
        console.log('Health check completed successfully.');
    } catch (err) {
        console.error('Health check execution error:', err.message);
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Telegram Storage Server running on port ${PORT}`);
    const SERVER_URL = process.env.RENDER_EXTERNAL_URL || 'https://download-link-server.onrender.com';
    
    // Auto ping every 4 minutes to keep server awake
    setInterval(() => {
        axios.get(`${SERVER_URL}/ping`)
            .then(() => console.log('Self-ping successful: Server is awake.'))
            .catch((err) => console.error('Self-ping failed:', err.message));
    }, 4 * 60 * 1000);

    // Schedule 24-hour link health checker task using node-cron (Runs every day at midnight or 24h interval)
    cron.schedule('0 0 * * *', () => {
        checkAllAppLinks();
    });
});
