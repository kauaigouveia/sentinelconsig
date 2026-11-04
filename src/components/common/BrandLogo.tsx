import React from 'react';
export interface BrandLogoProps {variant?:'full'|'transparent'|'symbol';className?:string;width?:string|number;height?:string|number;alt?:string;onClick?:()=>void;style?:React.CSSProperties;}
/** Official supplied artwork. Theme variants preserve original colors and aspect ratio. */
export const BrandLogo:React.FC<BrandLogoProps>=({variant='transparent',className='',width,height,alt='Sentinel Consig',onClick,style})=>{
 const symbol=variant==='symbol';
 return <span className={`sentinel-logo ${className}`} onClick={onClick} style={{display:'inline-grid',width:width??(symbol?32:180),height:height??(symbol?32:64),flexShrink:0,...style}}>
  {symbol?<img src="/branding/sentinel-symbol-v5.png" alt={alt} style={{width:'100%',height:'100%',objectFit:'contain'}} draggable={false}/>:<>
   <img className="sentinel-logo-light" src="/branding/sentinel-wordmark-light-v5.png" alt={alt} style={{width:'100%',height:'100%',objectFit:'contain',gridArea:'1/1'}} draggable={false}/>
   <img className="sentinel-logo-dark" src="/branding/sentinel-wordmark-dark-v5.png" alt={alt} style={{width:'100%',height:'100%',objectFit:'contain',gridArea:'1/1'}} draggable={false}/>
  </>}
 </span>;
};
