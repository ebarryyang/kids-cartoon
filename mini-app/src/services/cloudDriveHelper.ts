
import Taro from '@tarojs/taro';

const PROXY_BASE = process.env.TARO_APP_PROXY_BASE || 'https://kids-cartoon-two.vercel.app';
const DEFAULT_FOLDER = '/我的应用数据/英语宝贝动画宝';
const STORAGE_KEY = 'kids-cartoon/baidu-access-token';

const VIDEO_EXT_RE = /\.(mp4|mkv|avi|mov|m4v|flv|wmv|ts|webm)$/i;

export interface PanFile {
  fs_id: string | number;
  server_filename: string;
  isdir: number | string | boolean;
  size?: number | string;
  path?: string;
  dlink?: string;
}

export interface PanListResult {
  errno: number;
  errmsg?: string;
  list?: PanFile[];
  guid?: any;
  [k: string]: any;
}

export interface FolderVideo {
  fsId: string;
  fileId: string;
  fileName: string;
  size: number;
  dlink?: string;
}

function normIsDir(v: any): boolean {
  if (v === true || v === false) return v;
  return Number(v) === 1;
}

function getAccessToken(): string {
  try {
    const v = Taro.getStorageSync(STORAGE_KEY);
    return typeof v === 'string' ? v : '';
  } catch (e) {
    return '';
  }
}

export const CloudDriveHelper = {
  isDriveBound(): boolean {
    return !!getAccessToken();
  },

  setAccessToken(token: string) {
    try { Taro.setStorageSync(STORAGE_KEY, token || ''); } catch (e) {}
  },

  clearAccessToken() {
    try { Taro.removeStorageSync(STORAGE_KEY); } catch (e) {}
  },

  async bindDrive(): Promise<boolean> {
    const token = getAccessToken();
    if (token) return true;
    Taro.showModal({
      title: '尚未绑定百度网盘',
      content: '请在 Web 端（https://kids-cartoon-two.vercel.app/auth）完成百度授权后，把生成的 access_token 复制到小程序「我的 → 粘贴 access_token」输入框中，或用 Storage.set 设置。',
      showCancel: false,
      confirmText: '知道了',
    });
    return false;
  },

  getDefaultDir(): string {
    return DEFAULT_FOLDER;
  },

  getProxyBase(): string {
    return PROXY_BASE;
  },

  async getFileList(dir: string = DEFAULT_FOLDER): Promise<PanListResult> {
    const accessToken = getAccessToken();
    if (!accessToken) {
      return { errno: -99, errmsg: '未绑定百度网盘，请先到 Web 端授权获取 access_token', list: [] };
    }
    const params = new URLSearchParams();
    params.set('path', 'xpan/file');
    params.set('method', 'list');
    params.set('dir', dir);
    params.set('access_token', accessToken);
    params.set('order', 'name');
    params.set('limit', '200');
    params.set('showempty', '1');
    params.set('web', 'web');
    const url = `${PROXY_BASE}/api/baidu-pan-proxy?${params.toString()}`;
    try {
      const resp = await Taro.request<any>({
        url,
        method: 'GET',
        timeout: 20000,
        dataType: 'json',
        header: { Accept: 'application/json' },
      });
      const d = (resp && resp.data) ? resp.data : {};
      if (d && typeof d === 'object' && Array.isArray(d.list)) {
        d.list = d.list.map((x: any) => ({ ...(x || {}), isdir: normIsDir((x || {}).isdir) }));
      }
      return (d as any) as PanListResult;
    } catch (err: any) {
      const msg = (err && err.errMsg) ? err.errMsg : (err && err.message) ? err.message : String(err);
      return { errno: -98, errmsg: msg, list: [] };
    }
  },

  async getFileMetas(fsIds: Array<string | number>): Promise<PanListResult> {
    const accessToken = getAccessToken();
    if (!accessToken) return { errno: -99, errmsg: '未绑定百度网盘', list: [] };
    if (!fsIds || fsIds.length === 0) return { errno: 0, list: [] };
    const fsids = `[${fsIds.map((x) => String(x)).join(',')}]`;
    const params = new URLSearchParams();
    params.set('path', 'xpan/multimedia');
    params.set('method', 'filemetas');
    params.set('fsids', fsids);
    params.set('dlink', '1');
    params.set('access_token', accessToken);
    const url = `${PROXY_BASE}/api/baidu-pan-proxy?${params.toString()}`;
    try {
      const resp = await Taro.request<any>({
        url, method: 'GET', timeout: 20000, dataType: 'json',
        header: { Accept: 'application/json' },
      });
      return (resp && resp.data) ? (resp.data as any) : { errno: -98, list: [] };
    } catch (err: any) {
      const msg = (err && err.errMsg) ? err.errMsg : String(err);
      return { errno: -98, errmsg: msg, list: [] };
    }
  },

  async resolveRedirect(rawUrl: string): Promise<string> {
    if (!rawUrl) return rawUrl;
    try {
      const params = new URLSearchParams();
      params.set('url', rawUrl);
      const url = `${PROXY_BASE}/api/resolve-redirect?${params.toString()}`;
      const resp = await Taro.request<any>({
        url, method: 'GET', timeout: 15000, dataType: 'json',
        header: { Accept: 'application/json' },
      });
      const d = (resp && resp.data) ? resp.data : {};
      if (d && typeof d === 'object' && d.location) return String(d.location);
      return rawUrl;
    } catch (e) {
      return rawUrl;
    }
  },

  async getFolderVideos(folderPathOrFsId: string): Promise<FolderVideo[]> {
    if (!folderPathOrFsId) return [];
    const looksLikePath = folderPathOrFsId.startsWith('/');
    let list: PanFile[] = [];
    if (looksLikePath) {
      const r = await this.getFileList(folderPathOrFsId);
      if (r.errno !== 0 || !r.list) return [];
      list = r.list;
    } else {
      return [];
    }
    const videos = list.filter((f) => !normIsDir(f.isdir) && VIDEO_EXT_RE.test(f.server_filename || ''));
    const fsIds = videos.map((v) => String(v.fs_id)).filter(Boolean);
    if (fsIds.length === 0) return [];
    const meta = await this.getFileMetas(fsIds);
    const byId = new Map<string, any>();
    if (meta && Array.isArray(meta.list)) {
      meta.list.forEach((m: any) => { if (m) byId.set(String(m.fs_id), m); });
    }
    const out: FolderVideo[] = [];
    for (const v of videos) {
      const id = String(v.fs_id);
      const m = byId.get(id) || {};
      out.push({
        fsId: id,
        fileId: id,
        fileName: v.server_filename || m.server_filename || `video_${id}`,
        size: Number(v.size || m.size || 0),
        dlink: m.dlink || undefined,
      });
    }
    return out;
  },

  async getStreamingUrl(fileIdOrFsId: string): Promise<string> {
    if (!fileIdOrFsId) return '';
    const accessToken = getAccessToken();
    if (!accessToken) return '';
    const meta = await this.getFileMetas([fileIdOrFsId]);
    const m = (meta && Array.isArray(meta.list) && meta.list[0]) || ({} as any);
    const dlink: string = (m && m.dlink) ? String(m.dlink) : '';
    if (!dlink) return '';
    const withToken = dlink.includes('?') ? `${dlink}&access_token=${accessToken}` : `${dlink}?access_token=${accessToken}`;
    const finalUrl = await this.resolveRedirect(withToken);
    if (!finalUrl) return '';
    const q = new URLSearchParams();
    q.set('url', finalUrl);
    return `${PROXY_BASE}/api/proxy-video?${q.toString()}`;
  },
};
