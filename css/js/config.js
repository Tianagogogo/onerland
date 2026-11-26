const SUPABASE_URL = 'https://xtgkepaqikpzvnmpkoxsa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0Z2tlcGFxaWtwenZtcGtveHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU2NzU1MDgsImV4cCI6MjExMTI1MTUwOH0.dsY0P3S-alER-Dg9U_sdAvGR5aw90lrShn2vSLpm_4g';
const ADMIN_PIN = '1208';
const GEMINI_KEY_STORAGE = 'onerland_gemini_api_key';
const STORAGE_ARTISTS_KEY = 'onerland_custom_artists_v3';

const SB_HEADERS = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

const COLOR_ONER = 'linear-gradient(135deg, #DD0514 0%, #8D0D0E 100%)';
const COLOR_QINS = '#1E293B';
const COLOR_YY   = '#7C3AED';
const COLOR_MZY  = '#DB2777';
const COLOR_LC   = '#0284C7';
const COLOR_METAL_DEFAULT = 'linear-gradient(135deg, #334155 0%, #0f172a 100%)';

const ARTIST_META_MAP = {
  'ONER':     { artistId: 'oner',    color: COLOR_ONER },
  '坤音娱乐': { artistId: 'qins',    color: COLOR_QINS },
  '岳岳':     { artistId: 'pinkray', color: COLOR_YY },
  '木子洋':   { artistId: 'kwin',    color: COLOR_MZY },
  '灵超':     { artistId: 'didi',    color: COLOR_LC }
};

const VENUE_TRANSPORT_DB = [
  {
    keywords: ['合肥', '少荃'],
    routes: [
      '🚇 地铁：4号线「综保区站」B口出站，步行约650米（8-10分钟）即达场馆',
      '🚄 合肥南站（高铁）：地铁4号线直达「综保区站」B口（约45分钟）；打车约21公里（30-35分钟）',
      '🚉 合肥站：地铁3号线至方庙站转4号线至「综保区站」B口（约30分钟）',
      '✈️ 新桥国际机场：机场巴士3号线至高铁南站转地铁4号线（约85分钟）'
    ].join('\n')
  },
  {
    keywords: ['疆进酒', 'OMNI SPACE'],
    routes: [
      '🚇 地铁：北京天桥艺术中心B1层「疆进酒·OMNI SPACE」，乘8号线「天桥站」A口出站步行约4分钟',
      '🚄 北京南站/西站：南站乘4号线至菜市口转7号线至珠市口再转8号线至天桥站（约20分钟）'
    ].join('\n')
  },
  {
    keywords: ['北京', '五棵松', '润百颜', '华熙', '国家体育馆', '工体', '鸟巢', '首都体育馆'],
    routes: [
      '🚇 地铁：五棵松/润百颜ECM乘1号线「五棵松站」B1/B2口步行2分钟；国家体育馆乘8号线「奥林匹克公园站」',
      '🚄 北京西站/南站：西站乘9号线至军事博物馆转1号线至五棵松（约25分钟）；南站乘4号线至西单转1号线（约40分钟）',
      '✈️ 首都/大兴机场：首都机场线转2号线再转1号线（约65分钟）；大兴机场线转10号线再转1号线（约70分钟）'
    ].join('\n')
  },
  {
    keywords: ['西安', '奥体', '曲江', '西演SPACE'],
    routes: [
      '🚇 地铁：西安奥体中心乘14号线「奥体中心站」出站即达；西演SPACE·创意谷乘5号线「雁翔路北口站」',
      '🚄 西安北站（高铁）：地铁14号线直达「奥体中心站」（约12分钟）',
      '✈️ 咸阳国际机场：地铁14号线直达「奥体中心站」（约45分钟）'
    ].join('\n')
  },
  {
    keywords: ['上海', '梅赛德斯', '东方体育', '万代南梦宫', '蜚声', '育音堂', '瓦肆', 'VAS'],
    routes: [
      '🚇 地铁：梅奔乘8号线「中华艺术宫站」；万代南梦宫乘13号线「江宁路站」；蜚声乘8号线「曲阜路站」；瓦肆乘3/4/13号线「金沙江路站」',
      '🚄 上海虹桥站/机场：地铁10号线/2号线换乘市区线路（约35-50分钟）'
    ].join('\n')
  },
  {
    keywords: ['广州', '宝能', '声音共和', '太空间', '太古仓'],
    routes: [
      '🚇 地铁：宝能演艺中心乘6/7号线「萝岗站」；太空间/声音共和乘8号线「沙园站」或「凤凰新村站」步行约10分钟',
      '🚄 广州南站（高铁）：地铁7号线直达「萝岗站」（约55分钟）；至太空间乘2号线至昌岗转8号线（约35分钟）'
    ].join('\n')
  },
  {
    keywords: ['深圳', '大运', '春茧', '深圳湾', 'B10', 'HOU LIVE', '纽空间'],
    routes: [
      '🚇 地铁：大运中心乘16号线「大运中心站」；HOU LIVE下沙店乘9号线「下沙站」B口；B10现场乘2号线「侨城北站」B口',
      '🚄 深圳北站（高铁）：乘4号线/5号线换乘直达各Livehouse及场馆（约30-50分钟）'
    ].join('\n')
  },
  {
    keywords: ['杭州', '奥体', '小莲花', '酒球会', '大麦66', 'CH8'],
    routes: [
      '🚇 地铁：杭州奥体中心乘6/7号线「奥体中心站」；大麦66Livehouse乘5号线「杭氧站」；CH8乘5号线「创景路站」',
      '🚄 杭州东站/萧山机场：地铁6号线直达奥体中心（约25分钟）；7号线从机场直达奥体（约30分钟）'
    ].join('\n')
  },
  {
    keywords: ['成都', '东安湖', '凤凰山', '正火', 'CH8', '福馆', 'MAO'],
    routes: [
      '🚇 地铁：凤凰山乘5号线「杜家碾站」；正火艺术中心乘2号线「洪河站」；福馆乘1号线「锦城广场站」',
      '🚄 成都东站（高铁）：乘2号线/7号线换乘各场馆及Livehouse（约20-40分钟）'
    ].join('\n')
  },
  {
    keywords: ['南京', '奥体', '1701', '稻香', '欧拉'],
    routes: [
      '🚇 地铁：南京奥体乘2/10号线「奥体中心站」；1701 Live House Max乘1号线「百家湖站」；稻香乘2号线「油坊桥站」',
      '🚄 南京南站（高铁）：1号线直达百家湖（约15分钟）或转10号线至奥体中心（约25分钟）'
    ].join('\n')
  }
];

const DEFAULT_ARTISTS = [
  {
    artistId: 'oner',
    artistName: 'ONER',
    badgeStyle: COLOR_ONER,
    accounts: [
      { id: 'oner_wb', name: '微博', color: COLOR_ONER, url: 'https://rsshub.app/weibo/user/6524267181' },
      { id: 'oner_xhs', name: '小红书', color: COLOR_ONER, url: 'https://rsshub.app/xiaohongshu/user/64d9d216000000000100646b/notes' },
      { id: 'oner_dy', name: '抖音', color: COLOR_ONER, url: 'https://rsshub.app/douyin/user/MS4wLjABAAAAX2dJKmn9ZDVnsNdM_VPT_Lco3l8fpRp0PCRQ24uSzG4' },
      { id: 'oner_tt', name: 'TikTok', color: COLOR_ONER, url: 'https://rsshub.app/tiktok/user/@oner0830official' },
      { id: 'oner_ig', name: 'Instagram', color: COLOR_ONER, url: 'https://rsshub.app/instagram/user/oner_official' },
      { id: 'oner_bili', name: 'B站', color: COLOR_ONER, url: 'https://rsshub.app/bilibili/user/video/670365731' }
    ]
  },
  {
    artistId: 'qins',
    artistName: '坤音娱乐',
    badgeStyle: COLOR_QINS,
    accounts: [
      { id: 'qins_wb', name: '微博', color: COLOR_QINS, url: 'https://rsshub.app/weibo/user/6062604272' },
      { id: 'qins_dy', name: '抖音', color: COLOR_QINS, url: 'https://rsshub.app/douyin/user/MS4wLjABAAAAWTvzHZq48nC6rktRVvjlqv1-4b7ewFs1jy2qrzFHzyU' },
      { id: 'qins_ig', name: 'Instagram', color: COLOR_QINS, url: 'https://rsshub.app/instagram/user/qinsentertainment' },
      { id: 'qins_bili', name: 'B站', color: COLOR_QINS, url: 'https://rsshub.app/bilibili/user/video/172392717' },
      { id: 'qins_yt', name: 'YouTube', color: COLOR_QINS, url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCF-kpt07kZx9RMsBB2k-QlQ' }
    ]
  },
  {
    artistId: 'pinkray',
    artistName: '岳岳',
    badgeStyle: COLOR_YY,
    accounts: [
      { id: 'yy_wb', name: '微博', color: COLOR_YY, url: 'https://rsshub.app/weibo/user/6392771552' },
      { id: 'yy_xhs', name: '小红书', color: COLOR_YY, url: 'https://rsshub.app/xiaohongshu/user/5a5c65f811be106a7251d287/notes' },
      { id: 'yy_dy', name: '抖音', color: COLOR_YY, url: 'https://rsshub.app/douyin/user/MS4wLjABAAAAXzN1GfvLXnG3-CSbB9ODEawvgowtEwCLbH1CrgbWShv_uAbweB8mqdVkMHqYVZ-S' },
      { id: 'yy_tt', name: 'TikTok', color: COLOR_YY, url: 'https://rsshub.app/tiktok/user/@pinkray_oner' },
      { id: 'yy_ig', name: 'Instagram', color: COLOR_YY, url: 'https://rsshub.app/instagram/user/pinkray_official' }
    ]
  },
  {
    artistId: 'kwin',
    artistName: '木子洋',
    badgeStyle: COLOR_MZY,
    accounts: [
      { id: 'mzy_wb', name: '微博', color: COLOR_MZY, url: 'https://rsshub.app/weibo/user/6400910760' },
      { id: 'mzy_xhs', name: '小红书', color: COLOR_MZY, url: 'https://rsshub.app/xiaohongshu/user/5a5c7e6111be1064506d7edf/notes' },
      { id: 'mzy_dy', name: '抖音', color: COLOR_MZY, url: 'https://rsshub.app/douyin/user/MS4wLjABAAAAQeNwNv0VAWX3IcnMTqaHgpBFbLEMs5YVQ2U702OVYBSHVKw9T1Aab4P_7BmWI7GK' },
      { id: 'mzy_tt', name: 'TikTok', color: COLOR_MZY, url: 'https://rsshub.app/tiktok/user/@kwin_oner' },
      { id: 'mzy_ig', name: 'Instagram', color: COLOR_MZY, url: 'https://rsshub.app/instagram/user/kwin0421_official' }
    ]
  },
  {
    artistId: 'didi',
    artistName: '灵超',
    badgeStyle: COLOR_LC,
    accounts: [
      { id: 'lc_wb', name: '微博', color: COLOR_LC, url: 'https://rsshub.app/weibo/user/6400910962' },
      { id: 'lc_xhs', name: '小红书', color: COLOR_LC, url: 'https://rsshub.app/xiaohongshu/user/5a5ca2e2e8ac2b239b29d3a6/notes' },
      { id: 'lc_dy', name: '抖音', color: COLOR_LC, url: 'https://rsshub.app/douyin/user/MS4wLjABAAAAaCStczPllk8yRlFr3QLnEAJQAtgSfgO3tDZ1Jz8R1uW4Ot3fu4UYivRqMmEJ_OX0' },
      { id: 'lc_tt', name: 'TikTok', color: COLOR_LC, url: 'https://rsshub.app/tiktok/user/@didi_oner' },
      { id: 'lc_ig', name: 'Instagram', color: COLOR_LC, url: 'https://rsshub.app/instagram/user/didichao_official' }
    ]
  }
];

function findPresetTransport(textToMatch) {
  if (!textToMatch) return '';
  for (const item of VENUE_TRANSPORT_DB) {
    if (item.keywords.some(kw => textToMatch.toLowerCase().includes(kw.toLowerCase()))) {
      return item.routes;
    }
  }
  return '';
}
