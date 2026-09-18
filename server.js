const express = require('express');
const axios = require('axios');
const cron = require('node-cron');
const multer = require('multer');
const FormData = require('form-data');
const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());

// Telegram Accounts Configuration (Abhi 1 active hai, baaki 2 ke liye jagah hai)
const TELEGRAM_ACCOUNTS = [
    {
        botToken: '8953260237:AAGeFUzkNOzhQ8dthA00K81cgXwI8ZqkY90',
        chatId: '-1003935579226',
        accountName: 'Account 1'
    }
    /* 
    // 2-3 din baad jab baaki 2 add karne hon, toh inhe uncomment karke details bhar dena:
    ,
    {
        botToken: 'YOUR_BOT_2_TOKEN',
        chatId: '-100xxxxxxxxxx',
        accountName: 'Account 2'
    },
    {
        botToken: 'YOUR_BOT_3_TOKEN',
        chatId: '-100yyyyyyyyyy',
        accountName: 'Account 3'
    }
    */
];

let currentAccountIndex = 0;

// Ping route for self-ping to prevent Render sleep
app.get('/ping', (req, res) => {
    res.send('Pong! Server is active.');
});

// Upload API: Console se file yahan aayegi aur round-robin rotate hogi
app.post('/api/upload-apk', upload.fields([{ name: 'apkFile' }, { name: 'logoFile' }]), async (req, res) => {
    try {
        const activeAccount = TELEGRAM_ACCOUNTS[currentAccountIndex];
        currentAccountIndex = (currentAccountIndex + 1) % TELEGRAM_ACCOUNTS.length;

        const apkFile = req.files['apkFile'] ? req.files['apkFile'][0] : null;
        if (!apkFile) return res.status(400).json({ success: false, error: "APK file missing" });

        const formData = new FormData();
        formData.append('chat_id', activeAccount.chatId);
        formData.append('document', apkFile.buffer, apkFile.originalname);

        // Telegram Bot API par file bhejna
        const tgRes = await axios.post(`https://api.telegram.org/bot${activeAccount.botToken}/sendDocument`, formData, {
            headers: formData.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        if (!tgRes.data.ok) throw new Error("Telegram upload failed");

        const fileId = tgRes.data.result.document.file_id;
        const filePatRes = await axios.get(`https://api.telegram.org/bot${activeAccount.botToken}/getFile?file_id=${fileId}`);
        const filePath = filePatRes.data.result.file_path;
        
        // Direct Browser Download Link
        const directDownloadUrl = `https://api.telegram.org/file/bot${activeAccount.botToken}/${filePath}`;

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

// Daily Cron Job: Har 24 ghante mein links check karega aur dead hone par console par App Name & Channel Name print karega
cron.schedule('0 0 * * *', async () => {
    console.log("Running Daily Link Health Check...");
    try {
        const firebaseDB = "https://apk-layer-default-rtdb.firebaseio.com/apps.json";
        const dbRes = await axios.get(firebaseDB);
        const apps = dbRes.data;
        if (!apps) return;

        for (const appId in apps) {
            const appData = apps[appId];
            const downloadUrl = appData.archiveUrl;

            if (downloadUrl && downloadUrl.includes('telegram.org')) {
                try {
                    const checkRes = await axios.head(downloadUrl);
                    if (checkRes.status !== 200) throw new Error("Bad status");
                } catch (linkErr) {
                    let affectedAccount = "Unknown Account";
                    for (let acc of TELEGRAM_ACCOUNTS) {
                        if (downloadUrl.includes(acc.botToken)) {
                            affectedAccount = acc.accountName;
                            break;
                        }
                    }
                    console.log(`❌ CHANNEL/ACCOUNT BAN ALERT!`);
                    console.log(`📱 App Name: ${appData.appName}`);
                    console.log(`📂 Affected Account/Channel: ${affectedAccount}`);
                    console.log(`🔗 Broken Link: ${downloadUrl}\n-----------------------------------`);
                }
            }
        }
    } catch (err) {
        console.error("Cron Error:", err.message);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Telegram Storage Server running on port ${PORT}`);

    // Self-ping mechanism to keep Render alive every 14 minutes
    const SERVER_URL = process.env.RENDER_EXTERNAL_URL || 'https://download-link-server.onrender.com';
    setInterval(() => {
        axios.get(`${SERVER_URL}/ping`)
            .then(() => console.log('Self-ping successful: Server is awake.'))
            .catch((err) => console.error('Self-ping failed:', err.message));
    }, 14 * 60 * 1000);
});
