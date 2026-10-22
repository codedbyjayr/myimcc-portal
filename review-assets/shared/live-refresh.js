(function(global) {
  global.imccLiveRefresh = function(client, tables, refresh) {
    let timer, channel, stopped = false, running = false, pending = false;
    const changes = new Set();
    async function run() {
      if (stopped || document.hidden) return;
      if (running) { pending = true; return; }
      running = true;
      const batch = [...changes]; changes.clear();
      try { await refresh(batch); } catch (error) { console.warn('Background refresh failed:', error); }
      finally { running = false; if (pending) { pending = false; schedule(); } }
    }
    function schedule(table) {
      if (stopped) return;
      if (table) changes.add(table);
      clearTimeout(timer); timer = setTimeout(run, 400);
    }
    const resume = () => { if (!document.hidden) schedule(); };
    document.addEventListener('visibilitychange', resume);
    global.addEventListener('online', resume);
    // Brokered previews intentionally have no direct realtime socket.
    if (global.IMCC_DEVELOPER_VIEW === undefined && typeof client.channel === 'function') {
      channel = client.channel('academic-refresh-' + Math.random().toString(36).slice(2));
      for (const spec of tables) for (const event of ['INSERT','UPDATE']) {
        channel.on('postgres_changes', {event, schema:'public', ...spec}, () => schedule(spec.table));
      }
      channel.subscribe(status => { if (status === 'SUBSCRIBED') schedule(); });
    }
    // Also catches deletes, missed events and unavailable websocket connections.
    const poll = setInterval(() => { if (!document.hidden) schedule(); }, 60000);
    const stop = () => {
      if (stopped) return;
      stopped = true; clearTimeout(timer); clearInterval(poll);
      document.removeEventListener('visibilitychange', resume); global.removeEventListener('online', resume);
      global.removeEventListener('pagehide', stop);
      if (channel) client.removeChannel(channel);
    };
    global.addEventListener('pagehide', stop, {once:true});
    return stop;
  };
})(window);
