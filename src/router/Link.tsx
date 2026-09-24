import React from 'react';
import { useRouter } from './RouterContext';

export interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
  replace?: boolean;
  preserveSearch?: boolean;
  children: React.ReactNode;
}

export const Link: React.FC<LinkProps> = ({
  to,
  replace,
  preserveSearch,
  children,
  onClick,
  className,
  ...rest
}) => {
  const { navigate } = useRouter();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Call user onClick handler if provided
    if (onClick) {
      onClick(e);
    }

    // Let browser handle special clicks (open in new tab / new window / download)
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.altKey ||
      e.ctrlKey ||
      e.shiftKey
    ) {
      return;
    }

    e.preventDefault();
    navigate(to, { replace, preserveSearch });
  };

  return (
    <a href={to} onClick={handleClick} className={className} {...rest}>
      {children}
    </a>
  );
};
