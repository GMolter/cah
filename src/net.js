export class Transport {
  constructor(roomCode){
    this.room = roomCode;
    this.channelName = `cadh-room-${roomCode}`;
    this.bc = ("BroadcastChannel" in self) ? new BroadcastChannel(this.channelName) : null;
    this.listeners = new Set();

    if(this.bc){
      this.bc.onmessage = (e)=> this.emit(e.data);
    }else{
      window.addEventListener("storage", (e)=>{
        if(e.key === this.channelName && e.newValue){
          const payload = JSON.parse(e.newValue);
          this.emit(payload);
        }
      });
    }
  }

  onMessage(fn){ this.listeners.add(fn); }
  offMessage(fn){ this.listeners.delete(fn); }
  emit(data){ this.listeners.forEach(fn=> fn(data)); }

  send(obj){
    const payload = { ...obj, _ts: Date.now() };
    if(this.bc){
      this.bc.postMessage(payload);
    }else{
      localStorage.setItem(this.channelName, JSON.stringify(payload));
      setTimeout(()=> localStorage.removeItem(this.channelName), 50);
    }
  }

  destroy(){
    this.listeners.clear();
    if(this.bc) this.bc.close();
  }
}
