export interface PublicLimitOptions {now?:()=>number;windowMs?:number;readLimit?:number;writeLimit?:number;maxClients?:number}
export function createPublicRateLimit(options:PublicLimitOptions={}){
  const now=options.now??Date.now,windowMs=options.windowMs??60000,readLimit=options.readLimit??60,writeLimit=options.writeLimit??10,maxClients=options.maxClients??1024;
  for(const value of [windowMs,readLimit,writeLimit,maxClients])if(!Number.isSafeInteger(value)||value<1)throw new Error('Invalid public rate limit');
  const clients=new Map<string,{expires:number;reads:number;writes:number}>();
  return {get clientCount(){return clients.size;},
    accept(client:string,write:boolean){
      const instant=now();
      for(const [key,value]of clients)if(value.expires<=instant)clients.delete(key);
      let bucket=clients.get(client);
      if(!bucket){
        if(clients.size>=maxClients||client.length>128)return {allowed:false,retryAfterSeconds:Math.max(1,Math.ceil(windowMs/1000))};
        bucket={expires:instant+windowMs,reads:0,writes:0};clients.set(client,bucket);
      }
      const field=write?'writes':'reads',limit=write?writeLimit:readLimit;
      if(bucket[field]>=limit)return {allowed:false,retryAfterSeconds:Math.max(1,Math.ceil((bucket.expires-instant)/1000))};
      bucket[field]++;return {allowed:true,retryAfterSeconds:0};
    },
  };
}
