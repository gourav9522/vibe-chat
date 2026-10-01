import os
import requests
from bs4 import BeautifulSoup
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

# Apni credentials seedha yahan daal di hain
CLIENT_ID = "519103871395-bhf39op6fdj8s7e8aq8f3c40qf8c3u4f.apps.googleusercontent.com"
CLIENT_SECRET = "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"
REFRESH_TOKEN = "1//04vlS83AUAz-hCgYIARAAGAQSNwF-L9IrgZNjqC6izJy7pskvmbts-wlZxmbXIxBEo_HR3KKvOoTeQle9LFnCJpaKU-cc2BpeEuQ"
BLOG_ID = "2982238408328855288"

# Firebase Database URL (Tera Vibe Chat wala Firebase Realtime Database)
FIREBASE_URL = "https://vibe-chat-ee27e-default-rtdb.firebaseio.com/games.json"

def get_blogger_service():
    creds = Credentials(
        None,
        refresh_token=REFRESH_TOKEN,
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
        token_uri="https://oauth2.googleapis.com/token"
    )
    return build('blogger', 'v3', credentials=creds)

def check_and_extract_link(source_page_url):
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        response = requests.get(source_page_url, headers=headers, timeout=10)
        if response.status_code != 200:
            return None
            
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Source page se direct download link nikalne ka selector (Apne source ke hisaab se change kar sakta hai)
        download_tag = soup.find('a', class_='download-btn')
        if download_tag and 'href' in download_tag.attrs:
            return download_tag['href']
    except Exception as e:
        print(f"Error scraping {source_page_url}: {e}")
    return None

def update_blogger_post(post_id, new_download_link):
    service = get_blogger_service()
    try:
        post = service.posts().get(blogId=BLOG_ID, postId=post_id).execute()
        content = post['content']
        
        # Purani link ko nayi direct download link se replace karna
        updated_content = content.replace("OLD_LINK_PLACEHOLDER", new_download_link)
        
        post['content'] = updated_content
        service.posts().update(blogId=BLOG_ID, postId=post_id, body=post).execute()
        print(f"Successfully updated post ID: {post_id}")
    except Exception as e:
        print(f"Failed to update Blogger post: {e}")

def main():
    response = requests.get(FIREBASE_URL)
    if response.status_code != 200:
        print("Failed to fetch data from Firebase")
        return
        
    games_data = response.json()
    if not games_data:
        print("No games found in Firebase.")
        return
        
    for game_id, data in games_data.items():
        source_url = data.get('source_url')
        current_download_link = data.get('download_link')
        blogger_post_id = data.get('blogger_post_id')
        
        try:
            link_test = requests.head(current_download_link, timeout=5, allow_redirects=True)
            # Agar link mar chuki hai ya error de rahi hai
            if link_test.status_code >= 400:
                print(f"Link expired for {game_id}. Extracting new link...")
                new_link = check_and_extract_link(source_url)
                if new_link:
                    update_blogger_post(blogger_post_id, new_link)
        except:
            print(f"Link broken for {game_id}. Finding new link...")
            new_link = check_and_extract_link(source_url)
            if new_link:
                update_blogger_post(blogger_post_id, new_link)

if __name__ == '__main__':
    main()
