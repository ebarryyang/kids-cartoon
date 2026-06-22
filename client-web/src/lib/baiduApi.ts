import axios from 'axios';

export const APP_KEY = 'QzZpo7lkiRQjYoYtACRyYCWjrcNyLqmP'; 
export const SECRET_KEY = 'Ig5e7CeRvJDKhfsuZoueUyqkxUYPWnH8'; // 仅用于本地 MVP 演示

// OOB 授权换取 Token
export const getTokenWithCode = async (code: string) => {
  const url = `/baidu-oauth/oauth/2.0/token?grant_type=authorization_code&code=${code}&client_id=${APP_KEY}&client_secret=${SECRET_KEY}&redirect_uri=oob`;
  const response = await axios.get(url);
  return response.data;
};

// 获取文件列表
export const getFileList = async (accessToken: string, dir: string = '/我的应用数据/英语宝贝动画宝') => {
  const url = `/baidu-api/rest/2.0/xpan/file?method=list&dir=${encodeURIComponent(dir)}&access_token=${accessToken}`;
  const response = await axios.get(url);
  return response.data;
};

// 获取文件 dlink
export const getFileMetas = async (accessToken: string, fsids: number[]) => {
  const url = `/baidu-api/rest/2.0/xpan/multimedia?method=filemetas&fsids=[${fsids.join(',')}]&dlink=1&access_token=${accessToken}`;
  const response = await axios.get(url);
  return response.data;
};

// 解析 302 重定向获取真实 CDN 链接
export const resolveRedirect = async (dlink: string, accessToken: string) => {
  try {
    const fullUrl = `${dlink}&access_token=${accessToken}`;
    // 使用本地 Python 代理服务器解析 302 重定向
    const proxyUrl = `http://127.0.0.1:8080/get_video_url?url=${encodeURIComponent(fullUrl)}`;
    const response = await axios.get(proxyUrl);
    
    if (response.data && response.data.location) {
      let location = response.data.location;
      // 保证重定向也是安全的 https
      if (location.startsWith('http://')) {
         location = location.replace('http://', 'https://');
      }
      return location;
    }
    
    return fullUrl;
  } catch (error) {
    console.error('Error resolving redirect:', error);
    return `${dlink}&access_token=${accessToken}`;
  }
};

// 将真实 CDN 链接转换为本地代理链接
export const getProxiedVideoUrl = (cdnUrl: string) => {
  if (!cdnUrl) return '';
  if (cdnUrl.includes('baidupcs.com')) {
    // 终极杀手锏：直接把请求转发给本地 Python 代理服务器处理
    return `http://127.0.0.1:8080/proxy_video?url=${encodeURIComponent(cdnUrl)}`;
  }
  return cdnUrl;
};
