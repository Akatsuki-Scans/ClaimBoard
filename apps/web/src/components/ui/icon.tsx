import React from 'react';

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
}

/**
 * Home / Dashboard Icon
 */
export function HomeIcon({ className = 'h-4 w-4', ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      {...props}
    >
      <path d="M0 0h24v24H0z" fill="none" />
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      >
        <path d="M21 19v-6.733a4 4 0 0 0-1.245-2.9L13.378 3.31a2 2 0 0 0-2.755 0L4.245 9.367A4 4 0 0 0 3 12.267V19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2" />
        <path d="M9 15a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6H9z" />
      </g>
    </svg>
  );
}

/**
 * Open Work Icon
 */
export function OpenWorkIcon({ className = 'h-4 w-4', ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      {...props}
    >
      <path d="M0 0h24v24H0z" fill="none" />
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M3.75 8A4.75 4.75 0 0 1 8.5 3.25h10c.966 0 1.75.784 1.75 1.75v15a1.75 1.75 0 0 1-1.75 1.75h-11A3.75 3.75 0 0 1 3.75 18zm15-3v9.25H7.5c-.844 0-1.623.279-2.25.75V8A3.25 3.25 0 0 1 8.5 4.75h3.208a20.8 20.8 0 0 0 .071 5.97l.063.397a.75.75 0 0 0 1.292.392l1.366-1.48l1.366 1.48a.75.75 0 0 0 1.292-.392l.063-.397a20.8 20.8 0 0 0 .071-5.97H18.5a.25.25 0 0 1 .25.25m-2.972-.25h-2.556a19.3 19.3 0 0 0-.108 4.57l.651-.706a1 1 0 0 1 1.47 0l.651.706a19.3 19.3 0 0 0-.108-4.57m-8.278 11h11.25V20a.25.25 0 0 1-.25.25h-11a2.25 2.25 0 0 1 0-4.5"
        clipRule="evenodd"
      />
    </svg>
  );
}

/**
 * My Claims Icon
 */
export function MyClaimsIcon({ className = 'h-4 w-4', ...props }: IconProps) {
  const reactId = React.useId();
  const maskId = `my-claims-mask-${reactId.replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      className={className}
      {...props}
    >
      <path d="M0 0h48v48H0z" fill="none" />
      <defs>
        <mask id={maskId}>
          <g
            fill="none"
            stroke="#fff"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="4"
          >
            <path fill="#555" d="M12 8h24l8 10l-20 24L4 18z" />
            <path d="M4 18h40M24 42l-8-24m8 24l8-24M8 13l-4 5l20 24l20-24l-4-5" />
          </g>
        </mask>
      </defs>
      <path fill="currentColor" d="M0 0h48v48H0z" mask={`url(#${maskId})`} />
    </svg>
  );
}

/**
 * Pipeline / Production Workflow Icon
 */
export function PipelineIcon({ className = 'h-4 w-4', ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="6" r="3" />
      <path d="M18 9v2a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9" />
      <path d="M12 12v3" />
    </svg>
  );
}

/**
 * Manga Catalog Icon
 */
export function MangaIcon({ className = 'h-4 w-4', ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

/**
 * History / Logs Icon
 */
export function HistoryIcon({ className = 'h-4 w-4', ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}

/**
 * Team / Members Icon
 */
export function TeamIcon({ className = 'h-4 w-4', ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

/**
 * Analytics / Reports Icon
 */
export function AnalyticsIcon({ className = 'h-4 w-4', ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M18 20V10" />
      <path d="M12 20V4" />
      <path d="M6 20v-6" />
    </svg>
  );
}

/**
 * Settings / Configuration Icon
 */
export function SettingsIcon({ className = 'h-4 w-4', ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/**
 * ClaimBoard Emblem Logo
 */
export function ClaimBoardLogoIcon({ className = 'h-5 w-5', ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      {...props}
    >
      <path d="M12 2.5L14.2 7.2L12 9.5L9.8 7.2L12 2.5Z" />
      <path d="M21.5 12L16.8 14.2L14.5 12L16.8 9.8L21.5 12Z" />
      <path d="M12 21.5L9.8 16.8L12 14.5L14.2 16.8L12 21.5Z" />
      <path d="M2.5 12L7.2 9.8L9.5 12L7.2 14.2L2.5 12Z" />
      <rect x="10.5" y="10.5" width="3" height="3" rx="0.5" />
    </svg>
  );
}

// Aliases
export const DashboardIcon = HomeIcon;

/**
 * Admin Panel Icon
 */
export function AdminIcon({ className = 'h-4 w-4', ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
