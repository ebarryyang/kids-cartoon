import axios, { AxiosError } from 'axios';

export const APP_KEY = 'QzZpo7lkiRQjYoYtACRyYCWjrcNyLqmP';

function unwrapResponse<T>(promise: Promise<any>): Promise<T> {
  return promise
    .then((r) => r.data as T)
    .catch((err: AxiosError) => {
      if (err && (err as any).response && (err as any).response.data !== undefined) {
        return (err as any).response.data as T;
      }
      throw err;
    });
}

export const getTokenWithCode = async (code: string) => {
  return unwrapResponse<any>(
    axios.get(`/api/baidu-token?code=${encodeURIComponent(code)}`)
  );
};

export const getFileList = async (accessToken: string, dir: string = '/我的应用数据/英语宝贝动画宝') => {
  return unwrapResponse<any>(
    axios.get(`/api/baidu-pan-proxy?path=xpan/file&method=list&dir=${encodeURIComponent(dir)}&access_token=${encodeURIComponent(accessToken)}`)
  );
};

export const getFileMetas = async (accessToken: string, fsids: number[]) => {
  return unwrapResponse<any>(
    axios.get(`/api/baidu-pan-proxy?path=xpan/multimedia&method=filemetas&fsids=[${fsids.join(',')}]&dlink=1&access_token=${encodeURIComponent(accessToken)}`)
  );
};

export const resolveRedirect = async (dlink: string, accessToken: string) => {
  try {
    const fullUrl = `${dlink}&access_token=${encodeURIComponent(accessToken)}`;
    const proxyUrl = `/api/resolve-redirect?url=${encodeURIComponent(fullUrl)}`;
    const r: any = await unwrapResponse(axios.get(proxyUrl));

    if (r && r.location) {
      let location = String(r.location);
      if (location.startsWith('http://')) location = location.replace('http://', 'https://');
      return location;
    }

    return fullUrl;
  } catch (error) {
    console.error('Error resolving redirect:', error);
    return `${dlink}&access_token=${accessToken}`;
  }
};

export const getProxiedVideoUrl = (cdnUrl: string) => {
  if (!cdnUrl) return '';
  if (cdnUrl.includes('baidupcs.com')) {
    return `/api/proxy-video?url=${encodeURIComponent(cdnUrl)}`;
  }
  return cdnUrl;
};
