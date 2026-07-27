/* ===================== 云同步模块（跨设备） =====================
 * 把浏览器本地数据备份到 GitHub 仓库的 sync_data.json，实现跨设备一致。
 * ⚠️ 出于安全，token 不写死在代码里（会被 GitHub 密钥扫描拦截）。
 * token 由用户在页面「🔗 云同步」里填入，仅保存到本机浏览器（localStorage: ws_sync_token）。
 * 需要的 token：GitHub 细粒度 PAT，仅授权 seven11-cpu/douyin-workbench 一个仓库的 Contents 读写权限。
 */
const SYNC = {
  repo: 'seven11-cpu/douyin-workbench',
  path: 'sync_data.json',
  get token(){ return (localStorage.getItem('ws_sync_token')||'').trim(); },
  get api(){ return 'https://api.github.com/repos/'+this.repo+'/contents/'+this.path; },
  auth(){ return {'Authorization':'token '+this.token,'Content-Type':'application/json','User-Agent':'wb-sync'}; },
  enabled(){ return this.token.length>0; },

  /* 收集所有需要同步的本地 key（按账号命名空间隔离） */
  gather(){
    const d = new Date().toISOString().slice(0,10);
    const accs = ['xiaohao','dahao'];
    const items = {};
    accs.forEach(a=>{
      ['ws_tasks_'+a+'_'+d,'ws_favs_'+a,'ws_drafts_'+a,'ws_reviews_'+a,'ws_profile_'+a,'ws_buf_'+a].forEach(k=>{
        const v = localStorage.getItem(k);
        if(v!==null) try{ items[k] = JSON.parse(v); }catch(e){}
      });
    });
    const memos = localStorage.getItem('ws_memos');
    if(memos!==null) try{ items['ws_memos'] = JSON.parse(memos); }catch(e){}
    return {updatedAt:new Date().toISOString(), items};
  },

  /* 把云端数据写回本地并重新渲染 */
  apply(data){
    if(!data || !data.items) return;
    Object.entries(data.items).forEach(([k,v])=>{
      try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){}
    });
    if(window.renderAll) renderAll();
  },

  pull(cb){
    if(!this.enabled()){ cb&&cb(null); return; }
    fetch(this.api,{headers:this.auth()}).then(r=>r.ok?r.json():null).then(j=>{
      if(!j||!j.content) return cb&&cb(null);
      try{ cb&&cb(JSON.parse(atob(j.content.replace(/\s/g,'')))); }
      catch(e){ cb&&cb(null); }
    }).catch(()=>cb&&cb(null));
  },

  /* 上传：本地优先、缺失的从云端补齐（union 合并，保证数据不丢） */
  push(){
    if(!this.enabled()){ toast('请先在「🔗 云同步」里填入令牌'); return; }
    const local = this.gather();
    fetch(this.api,{headers:this.auth()}).then(r=>r.ok?r.json():null).then(j=>{
      let remote=null;
      if(j&&j.content){ try{ remote=JSON.parse(atob(j.content.replace(/\s/g,''))); }catch(e){} }
      const merged = {updatedAt:local.updatedAt, items:{}};
      const keys = new Set([...Object.keys(local.items), ...(remote&&remote.items?Object.keys(remote.items):[])]);
      keys.forEach(k=>{ merged.items[k] = (k in local.items)? local.items[k] : remote.items[k]; });
      const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(merged))));
      const body = {message:'sync: 跨设备云同步', content:b64};
      if(j&&j.sha) body.sha = j.sha;
      return fetch(this.api,{method:'PUT',headers:this.auth(),body:JSON.stringify(body)});
    }).then(()=>console.log('[sync] pushed')).catch(e=>console.warn('[sync] push fail',e));
  }
};

let _syncTimer = null;
function scheduleSync(){ if(typeof SYNC==='undefined'||!SYNC.enabled()) return; clearTimeout(_syncTimer); _syncTimer = setTimeout(()=>SYNC.push(), 900); }

/* 页面里填入/更换同步令牌（弹窗，避开 iOS 对 prompt 的限制） */
function setupSync(){
  if(typeof $==='undefined') return;
  $('syncTokenInput').value = localStorage.getItem('ws_sync_token')||'';
  $('syncModal').classList.add('show');
  setTimeout(()=>{ try{$('syncTokenInput').focus();}catch(e){} }, 50);
}
function closeSyncModal(){ $('syncModal').classList.remove('show'); }
function saveSyncToken(){
  const v = $('syncTokenInput').value.trim();
  if(!v){ localStorage.removeItem('ws_sync_token'); toast('已清除同步令牌'); }
  else{ localStorage.setItem('ws_sync_token', v); toast('已保存，正在同步…'); }
  closeSyncModal();
  SYNC.pull(data=>{
    if(data&&data.items&&Object.keys(data.items).length) SYNC.apply(data);
    SYNC.push();
  });
}
