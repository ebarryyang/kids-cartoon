import os
import json
import argparse
import subprocess
from pathlib import Path

# 尝试导入所需库，如果缺失则提示安装
try:
    import whisper
except ImportError:
    print("Error: 未安装 whisper。请运行: pip install -U openai-whisper")
    exit(1)

try:
    import requests
except ImportError:
    print("Error: 未安装 requests。请运行: pip install requests")
    exit(1)


def format_timestamp(seconds):
    """将秒数转换为 VTT 格式的时间戳 (HH:MM:SS.mmm)"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    milliseconds = int((seconds - int(seconds)) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{milliseconds:03d}"


def generate_vtt_content(segments):
    """将 Whisper 的分段数据转换为 WebVTT 格式文本"""
    vtt_content = "WEBVTT\n\n"
    for i, segment in enumerate(segments):
        start_time = format_timestamp(segment['start'])
        end_time = format_timestamp(segment['end'])
        text = segment['text'].strip()
        vtt_content += f"{i + 1}\n"
        vtt_content += f"{start_time} --> {end_time}\n"
        vtt_content += f"{text}\n\n"
    return vtt_content


def extract_vocabulary_with_llm(vtt_text, api_key, num_words=10):
    """调用阶跃星辰大模型 API 提取生词并生成 Markdown 表格"""
    print("\n🚀 正在调用阶跃星辰大模型提取核心生词...")
    
    prompt = f"""
这是一集儿童英语动画的完整字幕文件（WebVTT格式，包含时间戳）。
请你扮演儿童英语教研专家，从里面挑选出 {num_words} 个最适合 5-8 岁儿童学习的重点核心生词。

要求：
1. 必须是字幕中实际出现的单词，且符合儿童认知水平。
2. 触发时间必须是该单词在字幕中实际出现的大约时间（秒，保留一位小数）。
3. X和Y坐标请随机生成在 20 到 80 之间的整数（避开画面正中心）。
4. 严格只输出一个 Markdown 表格，不要包含任何其他多余的解释文字。

表格格式如下：
| 触发时间(s) | 英文单词 | 中文释义 | X坐标 | Y坐标 |
| --- | --- | --- | --- | --- |

以下是字幕内容：
{vtt_text}
"""

    url = "https://api.stepfun.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    data = {
        "model": "step-3.5-flash",
        "messages": [
            {"role": "system", "content": "你是一个专业的儿童英语教研助手。"},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.7
    }
    
    try:
        response = requests.post(url, headers=headers, json=data)
        response.raise_for_status() # 检查 HTTP 错误
        result_json = response.json()
        return result_json['choices'][0]['message']['content'].strip()
    except requests.exceptions.RequestException as e:
        print(f"❌ 调用大模型失败: {e}")
        if hasattr(e, 'response') and e.response is not None:
             print(f"错误详情: {e.response.text}")
        return None


def generate_tts_audio(text, index, video_name, api_key):
    """调用 StepFun Audio API 生成 TTS 语音"""
    print(f"🔊 正在为单词 '{text}' 生成发音...")
    
    url = "https://api.stepfun.com/v1/audio/speech"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    # 针对儿童英语发音优化 instruction
    data = {
        "model": "stepaudio-2.5-tts",
        "voice": "cixingnansheng", # 可以根据阶跃官方音色列表替换为更适合儿童的音色
        "input": text,
        "instruction": "语速缓慢，发音清晰标准，带有鼓励和活泼的语气，适合教小朋友读英语单词"
    }
    
    audio_dir = Path("videos") / f"{video_name}_audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    audio_path = audio_dir / f"word_{index}_{text}.mp3"
    
    try:
        response = requests.post(url, headers=headers, json=data, stream=True)
        response.raise_for_status()
        
        with open(audio_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        print(f"   ✅ 发音已保存: {audio_path}")
        return str(audio_path)
    except requests.exceptions.RequestException as e:
         print(f"   ❌ 发音生成失败: {e}")
         if hasattr(e, 'response') and e.response is not None:
             print(f"   错误详情: {e.response.text}")
         return ""


def main():
    parser = argparse.ArgumentParser(description="自动处理儿童英文动画：生成字幕与生词表")
    parser.add_argument("video_path", help="要处理的视频文件路径 (例如: video.mp4)")
    parser.add_argument("--model", default="base", choices=["tiny", "base", "small", "medium", "large"], 
                        help="Whisper 模型大小 (默认: base。越大越准但越慢)")
    parser.add_argument("--words", type=int, default=10, help="要提取的生词数量 (默认: 10)")
    parser.add_argument("--api-key", help="StepFun (阶跃星辰) API Key (如果不提供，将尝试从环境变量 STEPFUN_API_KEY 获取)")
    
    args = parser.parse_args()
    video_path = Path(args.video_path)
    
    if not video_path.exists():
        print(f"❌ 找不到视频文件: {video_path}")
        return

    output_dir = video_path.parent
    base_name = video_path.stem

    # 如果是 mkv 文件，自动无损转换为 mp4，因为网页端 <video> 标签不支持播放 mkv
    if video_path.suffix.lower() == '.mkv':
        mp4_path = output_dir / f"{base_name}.mp4"
        if not mp4_path.exists():
            print(f"\n⚠️ 检测到 .mkv 文件！网页端不支持播放 mkv。")
            print(f"🔄 正在使用 FFmpeg 为您无损秒转为 .mp4 格式: {mp4_path.name} ...")
            try:
                # 使用 -codec copy 进行无损且极速的封装格式转换
                subprocess.run(
                    ["ffmpeg", "-i", str(video_path), "-codec", "copy", str(mp4_path)], 
                    check=True, 
                    stdout=subprocess.DEVNULL, 
                    stderr=subprocess.DEVNULL
                )
                print("✅ 转换成功！后续将在管理后台使用此 mp4 文件。")
            except Exception as e:
                print(f"❌ 转换 MP4 失败，请确保电脑已安装 FFmpeg。错误信息: {e}")
                print("（脚本仍将继续处理 mkv 提取字幕，但您可能需要手动转换视频格式以便在后台播放）")
        video_path = mp4_path # 将后续处理的路径指向 mp4

    api_key = args.api_key or os.environ.get("STEPFUN_API_KEY")
    if not api_key:
        print("⚠️ 警告: 未提供 API Key，将只生成英文字幕，跳过生词表提取步骤。")
        print("（你可以通过 --api-key 参数或设置 STEPFUN_API_KEY 环境变量来提供）")

    print(f"\n🎬 开始处理视频: {video_path.name}")
    print(f"🤖 加载 Whisper 模型 ({args.model})... 这可能需要一点时间。")
    
    vtt_path = output_dir / f"{base_name}_en.vtt"
    md_path = output_dir / f"{base_name}_vocabulary.md"

    # 1. 使用 Whisper 提取字幕
    model = whisper.load_model(args.model)
    print("🎙️ 正在进行语音识别...")
    
    # fp16=False 避免在某些无 GPU 的机器上出现警告
    result = model.transcribe(str(video_path), language="en", fp16=False)
    
    # 2. 生成并保存 VTT 文件
    vtt_content = generate_vtt_content(result["segments"])
    with open(vtt_path, "w", encoding="utf-8") as f:
        f.write(vtt_content)
    print(f"✅ 英文字幕已生成: {vtt_path}")

    # 3. 如果提供了 API Key，则调用 LLM 提取生词
    if api_key:
        md_content = extract_vocabulary_with_llm(vtt_content, api_key, args.words)
        if md_content:
            print("\n🎧 正在批量生成单词发音音频...")
            lines = md_content.split('\n')
            updated_lines = []
            
            for i, line in enumerate(lines):
                if line.strip().startswith('|') and '---' not in line and '触发时间' not in line:
                    parts = [p.strip() for p in line.split('|')]
                    if len(parts) >= 4:
                        english_word = parts[2] # 英文单词在第三列 (索引2)
                        audio_file = generate_tts_audio(english_word, i, base_name, api_key)
                        
                        if audio_file:
                             frontend_audio_url = f"/media/{base_name}_audio/{Path(audio_file).name}"
                             print(f"   (提示: 请将生成的音频文件夹放到前端 public/media 下，并在后台配置自定义发音: {frontend_audio_url})")
                updated_lines.append(line)
            
            final_md_content = "\n".join(updated_lines)
            with open(md_path, "w", encoding="utf-8") as f:
                f.write(final_md_content)
            
            print(f"✅ 生词表 Markdown 已生成: {md_path}")
            print(f"✅ 发音音频: 已保存在 videos/{base_name}_audio/ 文件夹中")
            print("\n生成的生词表预览:")
            print("-" * 40)
            print(final_md_content)
            print("-" * 40)
            print("\n👉 提示：你可以直接将生成的 Markdown 文件和音频文件夹导入到管理后台中！")

if __name__ == "__main__":
    main()
