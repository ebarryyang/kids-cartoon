from flask import Flask, request, redirect, Response, jsonify
import requests

app = Flask(__name__)

# 允许跨域
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

@app.route('/get_video_url', methods=['GET'])
def get_video_url():
    """
    处理百度网盘 dlink 的 302 重定向，获取真实 CDN 地址
    """
    dlink = request.args.get('url')
    if not dlink:
        return jsonify({"error": "Missing url parameter"}), 400

    headers = {
        "User-Agent": "pan.baidu.com"
    }
    try:
        # 发起请求但不自动重定向，目的是获取 Location 头
        response = requests.get(dlink, headers=headers, allow_redirects=False)
        if response.status_code in [301, 302, 303, 307]:
            real_url = response.headers.get('Location')
            return jsonify({"location": real_url})
        else:
            return jsonify({"location": dlink, "status": response.status_code})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/proxy_video', methods=['GET'])
def proxy_video():
    """
    终极流媒体代理：完全由 Python 接管视频流的拉取和转发，彻底避开浏览器的 CORS 和防盗链限制
    """
    target_url = request.args.get('url')
    if not target_url:
        return "Missing url parameter", 400

    # 构造最干净的请求头，剥离所有浏览器的痕迹
    headers = {
        "User-Agent": "pan.baidu.com",
        "Accept": "*/*",
        "Connection": "keep-alive"
    }
    
    # 转发 Range 头，支持视频拖拽和分块加载
    if 'Range' in request.headers:
        headers['Range'] = request.headers['Range']

    try:
        # 发起流式请求
        req = requests.get(target_url, headers=headers, stream=True, timeout=10)
        
        # 构造流式响应
        def generate():
            for chunk in req.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    yield chunk

        response = Response(generate(), status=req.status_code)
        
        # 转发关键的响应头
        for key, value in req.headers.items():
            if key.lower() in ['content-type', 'content-length', 'content-range', 'accept-ranges']:
                response.headers[key] = value
                
        return response
    except Exception as e:
        return str(e), 500

if __name__ == '__main__':
    print("==================================================")
    print("🚀 本地 Python 代理服务器已启动，监听 8080 端口")
    print("提供接口：")
    print("1. /get_video_url?url=xxx (解析 302 重定向)")
    print("2. /proxy_video?url=xxx (视频流中转代理)")
    print("==================================================")
    app.run(port=8080, debug=False)
