import Taro from '@tarojs/taro';

export interface VideoFile {
  id: string;
  name: string;
  streamingUrl: string;
  coverUrl?: string;
  progress?: number;
  playCount?: number;
}

export class CloudDriveHelper {
  private static readonly BAIDU_OAUTH_SERVER = 'http://localhost:3001/api/baidu';
  
  // 模拟从本地存储读取 AccessToken
  private static getAccessToken(): string | null {
    return Taro.getStorageSync('baidu_access_token') || null;
  }

  /**
   * 绑定百度网盘
   * 实际业务中：由于微信小程序无法直接打开外部 OAuth 页面，通常的做法是：
   * 1. 引导用户复制一段链接去浏览器打开进行授权。
   * 2. 或者在后端对接百度的 Device Flow（设备授权码机制），在小程序内显示一个二维码或验证码，用户用百度网盘App扫码授权。
   * 这里我们演示拿到真实 AccessToken 后的处理逻辑。
   */
  public static async bindDrive(): Promise<boolean> {
    try {
      // 演示：假设我们已经通过某种方式（如 Device Flow）从我们自己的服务器拿到了 AccessToken
      // 此处为了让您的小程序能继续无缝演示，我们仍保留一个成功的 Promise 返回
      // 真实代码：
      // const res = await Taro.request({ url: `${this.BAIDU_OAUTH_SERVER}/auth-url` })
      // ...
      
      // 模拟成功获取到 Token 并存入本地
      Taro.setStorageSync('baidu_access_token', 'mock_real_baidu_token_12345');
      return true;
    } catch (error) {
      console.error('绑定网盘失败', error);
      return false;
    }
  }

  /**
   * 检查是否已绑定网盘
   */
  public static isDriveBound(): boolean {
    return !!this.getAccessToken();
  }

  /**
   * 模拟：获取指定文件夹下的动画片文件列表
   * 真实场景下，需使用网盘的 AccessToken 调用其 Open API 获取文件列表。
   */
  public static async getFolderVideos(folderId: string): Promise<VideoFile[]> {
    // 真实 API 逻辑示例：
    /*
    const token = this.getAccessToken();
    if (token) {
      const res = await Taro.request({
        url: 'https://pan.baidu.com/rest/2.0/xpan/file?method=list&dir=/apps/kids_animation',
        data: { access_token: token }
      });
      // 解析 res.data.list 组装为 VideoFile 数组
    }
    */
    
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve([
          {
            id: 'video_1',
            name: '第 1 集：Muddy Puddles',
            streamingUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
            coverUrl: 'https://images.unsplash.com/photo-1544568100-847a948585b9?w=300&q=80',
            playCount: 2,
            progress: 100
          },
          {
            id: 'video_2',
            name: '第 2 集：Mr Dinosaur is Lost',
            streamingUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
            coverUrl: 'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=300&q=80',
            playCount: 1,
            progress: 45
          },
          {
            id: 'video_3',
            name: '第 3 集：Best Friend',
            streamingUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
            coverUrl: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=300&q=80',
            playCount: 0,
            progress: 0
          },
          {
            id: 'video_4',
            name: '第 4 集：Polly Parrot',
            streamingUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
            coverUrl: 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=300&q=80',
            playCount: 0,
            progress: 0
          },
          {
            id: 'video_5',
            name: '第 5 集：Hide and Seek',
            streamingUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
            coverUrl: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=300&q=80',
            playCount: 0,
            progress: 0
          }
        ]);
      }, 800);
    });
  }

  /**
   * 真实获取指定文件的视频直链 (Streaming URL)
   * 结合刚才写好的 Node.js SaaS 后端中间件
   */
  public static async getStreamingUrl(fsid: string): Promise<string> {
    const token = this.getAccessToken();
    if (!token) return 'https://www.w3schools.com/html/mov_bbb.mp4';

    try {
      // 向我们自己的 Node.js 后端发起请求，用 fsid 换取 dlink直链
      const response = await Taro.request({
        url: `${this.BAIDU_OAUTH_SERVER}/video-stream`,
        method: 'GET',
        data: {
          access_token: token,
          fsid: fsid
        }
      });

      if (response.data && response.data.success) {
        return response.data.url; // 这个 URL 就可以直接放进 <Video src={url}> 播放了
      }
      return 'https://www.w3schools.com/html/mov_bbb.mp4';
    } catch (err) {
      console.error('获取真实流媒体直链失败', err);
      return 'https://www.w3schools.com/html/mov_bbb.mp4';
    }
  }
}
