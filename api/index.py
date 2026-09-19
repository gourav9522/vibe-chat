import os
import httpx
from fastapi import FastAPI, Response
from fastapi.responses import StreamingResponse

app = FastAPI()

# --- APNA BOT TOKEN AUR CHANNEL IDs YAHAN DAL DENA ---
BOT_TOKEN = "8953260237:AAGeFUzkNOzhQ8dthA00K81cgXwI8ZqkY90"
TARGET_CHAT_ID = "-1003935579226"
BACKUP_ALERT_CHAT_ID = "-1003935579226"  # <-- Jab naya backup channel dena ho, yahan change kar dena

VERCEL_URL = os.getenv("VERCEL_URL", "download-link-server.vercel.app")

TELEGRAM_API_URL = f"https://api.telegram.org/bot{BOT_TOKEN}"
TELEGRAM_FILE_URL = f"https://api.telegram.org/file/bot{BOT_TOKEN}"

@app.post("/webhook")
async def telegram_webhook(request: dict):
    try:
        message = request.get("message", {}) or request.get("channel_post", {})
        chat_id = str(message.get("chat", {}).get("id", ""))
        
        caption = message.get("caption", "")
        document = message.get("document", {})
        file_name = document.get("file_name", "Unknown_App.apk")
        
        app_name = caption if caption else file_name

        if not TARGET_CHAT_ID or chat_id == TARGET_CHAT_ID:
            file_id = None
            if "document" in message:
                file_id = message["document"]["file_id"]
            elif "video" in message:
                file_id = message["video"]["file_id"]
            elif "audio" in message:
                file_id = message["audio"]["file_id"]
                
            if file_id and chat_id:
                async with httpx.AsyncClient() as client:
                    file_path_res = (await client.get(f"{TELEGRAM_API_URL}/getFile?file_id={file_id}")).json()
                    if file_path_res.get("ok"):
                        file_path = file_path_res["result"]["file_path"]
                        direct_download_link = f"https://{VERCEL_URL}/download/{file_path}"
                        
                        is_link_working = False
                        try:
                            head_res = await client.head(direct_download_link, timeout=5.0)
                            if head_res.status_code < 400:
                                is_link_working = True
                        except Exception:
                            is_link_working = False

                        if is_link_working:
                            reply_text = f"🔥 **Direct Download Link Ready!**\n\n📦 **App:** {app_name}\n[Click Here to Download]({direct_download_link})"
                            await client.post(f"{TELEGRAM_API_URL}/sendMessage", json={
                                "chat_id": chat_id,
                                "text": reply_text,
                                "parse_mode": "Markdown"
                            })
                        else:
                            alert_text = f"⚠️ **ALERT: Download Link Failed!**\n\n📦 **App Name:** {app_name}\n📢 **Channel ID:** {chat_id}\n❌ Status: Link is dead or expired!"
                            await client.post(f"{TELEGRAM_API_URL}, json={
                                "chat_id": BACKUP_ALERT_CHAT_ID,
                                "text": alert_text,
                                "parse_mode": "Markdown"
                            })
                            
                            await client.post(f"{TELEGRAM_API_URL}/sendMessage", json={
                                "chat_id": chat_id,
                                "text": f"❌ Error: Link generation failed for `{app_name}`.",
                                "parse_mode": "Markdown"
                            })
    except Exception as e:
        print(f"Error: {e}")
    return {"status": "ok"}

@app.get("/")
def home():
    return {"status": "Vercel Server with Link Health Checker is active!"}

@app.get("/download/{file_path:path}")
async def proxy_download(file_path: str):
    tg_file_url = f"{TELEGRAM_FILE_URL}/{file_path}"
    client = httpx.AsyncClient(timeout=30.0)
    req = await client.get(tg_file_url, stream=True)
    
    async def generate():
        try:
            async for chunk in req.aiter_bytes(chunk_size=1024*1024):
                yield chunk
        finally:
            await req.aclose()
            await client.aclose()

    return StreamingResponse(
        generate(),
        media_type=req.headers.get("content-type", "application/octet-stream"),
        headers={"Content-Disposition": f'attachment; filename="{file_path.split("/")[-1]}"'}
    )
