import React from 'react';

export interface BrandLogoProps {
  /**
   * Variantes do logotipo:
   * - 'full': Logotipo completo com fundo branco
   * - 'transparent': Logotipo completo com fundo transparente
   * - 'symbol': Apenas o escudo/símbolo com fundo transparente
   */
  variant?: 'full' | 'transparent' | 'symbol';
  className?: string;
  width?: string | number;
  height?: string | number;
  alt?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'transparent',
  className = '',
  width,
  height,
  alt = 'Sentinel Consig',
  onClick,
  style,
}) => {
  // Caminhos correspondentes a cada variante
  const srcMap = {
    full: '/branding/sentinel-consig-logo.png',
    transparent: '/branding/sentinel-consig-logo-transparent.png',
    symbol: '/branding/sentinel-icon-transparent-v3.png',
  };

  const src = srcMap[variant] || srcMap.transparent;

  return (
    <img
      src={src}
      alt={alt}
      className={`object-contain select-none transition-all duration-200 ${className} ${onClick ? 'cursor-pointer' : ''}`}
      style={{
        width: width !== undefined ? width : undefined,
        height: height !== undefined ? height : undefined,
        ...style,
      }}
      onClick={onClick}
      referrerPolicy="no-referrer"
    />
  );
};
