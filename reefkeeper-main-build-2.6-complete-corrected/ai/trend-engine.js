(function(global){
  'use strict';
  const DAY=86400000;
  const VERSION='2.0.0';
  const PARAMS={
    po4:{label:'Phosphate',unit:'ppm',decimals:2,flat:0.005,target:[0.03,0.15]},
    alk:{label:'Alkalinity',unit:'dKH',decimals:1,flat:0.03,target:[7.5,10.5]},
    no3:{label:'Nitrate',unit:'ppm',decimals:1,flat:0.15,target:[2,25]},
    ca:{label:'Calcium',unit:'mg/L',decimals:0,flat:1,target:[380,480]},
    mg:{label:'Magnesium',unit:'mg/L',decimals:0,flat:2,target:[1250,1450]},
    ph:{label:'pH',unit:'',decimals:2,flat:0.01,target:[7.8,8.5]},
    sal:{label:'Salinity',unit:'SG',decimals:3,flat:0.0002,target:[1.024,1.027]}
  };
  function dateMs(v){const n=new Date(v||0).getTime();return Number.isFinite(n)?n:null;}
  function round(v,n=3){const p=10**n;return Math.round(v*p)/p;}
  function format(v,p){return Number(v).toFixed((p&&p.decimals)||2);}
  function linear(points){
    if(points.length<2)return {slopePerDay:0,r2:0};
    const t0=points[0].time; const xs=points.map(p=>(p.time-t0)/DAY); const ys=points.map(p=>p.value);
    const xm=xs.reduce((a,b)=>a+b,0)/xs.length, ym=ys.reduce((a,b)=>a+b,0)/ys.length;
    let num=0,den=0; xs.forEach((x,i)=>{num+=(x-xm)*(ys[i]-ym);den+=(x-xm)**2;});
    const slope=den?num/den:0, intercept=ym-slope*xm;
    const ssTot=ys.reduce((s,y)=>s+(y-ym)**2,0), ssRes=ys.reduce((s,y,i)=>s+(y-(intercept+slope*xs[i]))**2,0);
    return {slopePerDay:slope,r2:ssTot?Math.max(0,1-ssRes/ssTot):1};
  }
  function classify(points,p,slope,r2){
    if(points.length<2)return 'insufficient data';
    const vals=points.map(x=>x.value); const mean=vals.reduce((a,b)=>a+b,0)/vals.length;
    const sd=Math.sqrt(vals.reduce((s,v)=>s+(v-mean)**2,0)/vals.length);
    const threshold=Math.max(p.flat,Math.abs(mean)*0.002);
    if(r2<0.35 && sd>threshold*2)return 'oscillating';
    if(Math.abs(slope)<=threshold)return 'stable';
    return slope>0?'rising':'falling';
  }
  function normalizeEvents(events){return (events||[]).map(e=>({
    title:String(e.title||e.source||'Tank event'), notes:String(e.notes||''), category:String(e.category||e.type||''),
    time:dateMs(e.isoDate||e.completedAt||e.date), raw:e
  })).filter(e=>e.time).sort((a,b)=>a.time-b.time);}
  function relevantEvent(e,key){
    const text=(e.title+' '+e.notes+' '+e.category).toLowerCase();
    const generic=/water change|carbon|gfo|media|dose|dosing|test|calibrat|livestock|equipment|treatment|feeding/.test(text);
    const map={po4:/phosphate|po4|gfo|water change|feeding|carbon/,alk:/alk|alkalinity|dose|dosing|water change|calcium reactor/,no3:/nitrate|no3|feeding|water change|media/,ca:/calcium|ca\b|dose|dosing|water change/,mg:/magnesium|mg\b|dose|dosing|water change/,ph:/\bph\b|co2|skimmer|aeration|light|calibrat/,sal:/salinity|salt|water change|ato/};
    return (map[key]&&map[key].test(text))||generic;
  }
  function analyze(input){
    const key=input&&input.paramKey||'po4', p=PARAMS[key]||PARAMS.po4;
    const points=(input&&input.points||[]).map(x=>({value:Number(x.value),time:dateMs(x.isoDate||x.time||x.date),date:x.date||''})).filter(x=>Number.isFinite(x.value)&&x.time).sort((a,b)=>a.time-b.time);
    const recent=points.slice(-12); const reg=linear(recent); const status=classify(recent,p,reg.slopePerDay,reg.r2);
    const latest=recent[recent.length-1]||null, first=recent[0]||null;
    const spanDays=first&&latest?Math.max(0,(latest.time-first.time)/DAY):0;
    const change=first&&latest?latest.value-first.value:0;
    const events=normalizeEvents(input&&input.events).filter(e=>latest&&first&&e.time>=first.time&&e.time<=latest.time&&relevantEvent(e,key));
    let projection=null;
    if(latest&&Math.abs(reg.slopePerDay)>p.flat&&reg.r2>=0.55){
      const target=status==='falling'?p.target[1]:p.target[0];
      const days=(target-latest.value)/reg.slopePerDay;
      if(days>0&&days<=60)projection={target,days:Math.round(days)};
    }
    const inTarget=latest?latest.value>=p.target[0]&&latest.value<=p.target[1]:false;
    const strength=reg.r2>=0.75?'strong':reg.r2>=0.5?'moderate':'weak';
    const summary=!latest?`No ${p.label.toLowerCase()} readings are available.`:
      `${p.label} is ${status}${recent.length>1?` at ${format(Math.abs(reg.slopePerDay),p)} ${p.unit||''} per day`:''}. Latest: ${format(latest.value,p)}${p.unit?' '+p.unit:''}. ${inTarget?'It is within the configured reference range.':'It is outside the configured reference range.'} Trend confidence is ${strength}.`;
    const why=[
      `${recent.length} reading${recent.length===1?'':'s'} across ${Math.round(spanDays)} day${Math.round(spanDays)===1?'':'s'}.`,
      recent.length>1?`Net change: ${change>=0?'+':''}${format(change,p)}${p.unit?' '+p.unit:''}.`:'More readings are needed.',
      `Regression fit: ${Math.round(reg.r2*100)}%.`,
      events.length?`${events.length} relevant logged event${events.length===1?'':'s'} occurred in this period.`:'No relevant logged events were found in this period.'
    ];
    return {version:VERSION,paramKey:key,param:p,points:recent,status,slopePerDay:round(reg.slopePerDay,6),r2:round(reg.r2,3),latest,first,spanDays,change:round(change,6),inTarget,events,projection,summary,why};
  }
  global.ReefKeeperTrendEngine=Object.freeze({version:VERSION,params:PARAMS,analyze});
})(typeof window!=='undefined'?window:globalThis);
