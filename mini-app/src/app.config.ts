export default defineAppConfig({
  pages: [
    'pages/home/index',
    'pages/discover/index',
    'pages/honor/index',
    'pages/mine/index',
    'pages/player/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#fff',
    navigationBarTitleText: 'WeChat',
    navigationBarTextStyle: 'black'
  },
  tabBar: {
    color: '#86909C',
    selectedColor: '#FF7D00',
    backgroundColor: '#FFFFFF',
    borderStyle: 'white',
    custom: false, /* 保持原生配置，方便稳定展示 */
    list: [
      {
        pagePath: 'pages/home/index',
        text: '动画乐园',
        iconPath: 'assets/tabbar/home.png',
        selectedIconPath: 'assets/tabbar/home-active.png'
      },
      {
        pagePath: 'pages/discover/index',
        text: '发现',
        iconPath: 'assets/tabbar/discover.png',
        selectedIconPath: 'assets/tabbar/discover-active.png'
      },
      {
        pagePath: 'pages/honor/index',
        text: '荣誉墙',
        iconPath: 'assets/tabbar/honor.png',
        selectedIconPath: 'assets/tabbar/honor-active.png'
      },
      {
        pagePath: 'pages/mine/index',
        text: '宝宝中心',
        iconPath: 'assets/tabbar/mine.png',
        selectedIconPath: 'assets/tabbar/mine-active.png'
      }
    ]
  }
})