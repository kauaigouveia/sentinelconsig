import {useOptionalTheme} from '../../context/ThemeContext';
import React from 'react';
export interface BrandLogoProps {variant?:'full'|'transparent'|'symbol';className?:string;width?:string|number;height?:string|number;alt?:string;onClick?:()=>void;style?:React.CSSProperties;}
/** Official supplied artwork. Theme variants preserve original colors and aspect ratio. */
export const BrandLogo:React.FC<BrandLogoProps>=({variant='transparent',className='',width,height,alt='Sentinel Consig',onClick,style})=>{
 const symbol=variant==='symbol';
 const theme=useOptionalTheme();
 const dark=theme?.isDark??(typeof document!=='undefined'&&document.documentElement.classList.contains('dark'));
 const src=symbol?'/branding/sentinel-symbol-v6.png':`/branding/sentinel-wordmark-${dark?'dark':'light'}-v6.png`;
 return <span className={`sentinel-logo ${className}`} onClick={onClick} style={{display:'inline-grid',width:width??(symbol?32:180),height:height??(symbol?32:64),flexShrink:0,...style}}>
  <img src={src} alt={alt} style={{width:'100%',height:'100%',objectFit:'contain'}} draggable={false}/>

 </span>;
};
