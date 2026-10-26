'use client';
import {useLayoutEffect,useRef,useState} from 'react';
import {Minus,Plus,Scan} from 'lucide-react';

export default function FittedOrganizationCanvas({children}){
 const viewport=useRef(null),content=useRef(null);
 const [size,setSize]=useState({width:1,height:1,fit:1});
 const [height,setHeight]=useState(420),[manualScale,setManualScale]=useState(1);
 const [dragging,setDragging]=useState(false);
 const gesture=useRef(null),suppressClick=useRef(false);
 const startDrag=event=>{
  if(!event.isPrimary||event.button!==0)return;
  suppressClick.current=false;
  gesture.current={id:event.pointerId,x:event.clientX,y:event.clientY,left:event.currentTarget.scrollLeft,top:event.currentTarget.scrollTop,moved:false};
 };
 const moveDrag=event=>{
  const drag=gesture.current;
  if(!drag||drag.id!==event.pointerId)return;
  const x=event.clientX-drag.x,y=event.clientY-drag.y;
  if(!drag.moved&&Math.hypot(x,y)<5)return;
  if(!drag.moved){event.currentTarget.setPointerCapture(event.pointerId);drag.moved=true;setDragging(true);}
  suppressClick.current=true;
  event.currentTarget.scrollLeft=drag.left-x;
  event.currentTarget.scrollTop=drag.top-y;
 };
 const endDrag=event=>{
  if(gesture.current?.id!==event.pointerId)return;
  gesture.current=null;setDragging(false);
  if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
 };
 useLayoutEffect(()=>{
  const measure=()=>{
   if(!viewport.current||!content.current)return;
   const frame=viewport.current,tree=content.current;
   const availableHeight=Math.max(220,window.innerHeight-frame.getBoundingClientRect().top-20);
   setHeight(current=>Math.abs(current-availableHeight)>1?availableHeight:current);
   const width=tree.offsetWidth,height=tree.offsetHeight;
   const fit=Math.min(1,Math.max(1,frame.clientWidth-56)/Math.max(1,width),Math.max(1,frame.clientHeight-88)/Math.max(1,height));
   setSize(current=>Math.abs(current.width-width)<1&&Math.abs(current.height-height)<1&&Math.abs(current.fit-fit)<.001?current:{width,height,fit});
  };
  const observer=new ResizeObserver(measure);
  observer.observe(viewport.current);observer.observe(content.current);
  window.addEventListener('resize',measure);document.addEventListener('fullscreenchange',measure);measure();
  return()=>{observer.disconnect();window.removeEventListener('resize',measure);document.removeEventListener('fullscreenchange',measure);};
 },[]);
 const scale=manualScale??size.fit;
 return <div ref={viewport} className="personnel-fit-canvas" style={{height}}>
  <div className="personnel-fit-controls" aria-label="Thu phóng sơ đồ"><button type="button" onClick={()=>setManualScale(Math.max(.05,scale/1.2))} aria-label="Thu nhỏ" title="Thu nhỏ"><Minus size={15}/></button><span>{Math.round(scale*100)}%</span><button type="button" onClick={()=>setManualScale(Math.min(2,scale*1.2))} aria-label="Phóng to" title="Phóng to"><Plus size={15}/></button><button type="button" onClick={()=>{setManualScale(null);if(viewport.current){const frame=viewport.current.querySelector(".personnel-fit-scroll");frame?.scrollTo(0,0);}}} className="personnel-fit-reset"><Scan size={15}/>Vừa khung</button></div>
  <div className="personnel-fit-scroll focus-ring" tabIndex={0} role="region" aria-label="Sơ đồ nhân sự, kéo hoặc dùng phím mũi tên để di chuyển" style={{touchAction:'none',cursor:dragging?'grabbing':'grab',userSelect:'none'}} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag} onClickCapture={event=>{if(suppressClick.current){event.preventDefault();event.stopPropagation();suppressClick.current=false;}}}><div className="personnel-fit-space"><div style={{position:'relative',flexShrink:0,width:size.width*scale,height:size.height*scale,overflow:'hidden'}}><div ref={content} style={{position:'absolute',left:0,top:0,width:'max-content',transform:`scale(${scale})`,transformOrigin:'top left'}}>{children}</div></div></div></div>
 </div>;
}
