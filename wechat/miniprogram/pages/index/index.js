// H5 地址：就是现在线上那一份（sharecode 是访问凭证，不能省）
const H5 = 'https://towermates.app.workbuddy.host/?sharecode=U7XMLC2NKJ';

Page({
  data: { url: H5 },
  onLoad(query) {
    // 页面参数透传（例如带 ?q=from%3Dshare 时拼到 H5 的 query 后面）
    const extra = query && query.q;
    if (extra) this.setData({ url: H5 + '&' + decodeURIComponent(extra) });
  },
  // web-view 的 load 事件：记下真实地址，用于区分「壳没打开」和「游戏自己崩了」
  onViewLoad(ev) {
    if (ev && ev.detail && ev.detail.url) this.h5Url = ev.detail.url;
  },
  onError() {
    wx.showModal({
      title: '没打开塔门',
      content: '网络或「业务域名」校验没通过。若一直这样，先查小程序后台的业务域名配置。',
      showCancel: false,
    });
  },
  onMessage() {},
});
