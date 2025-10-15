/* eslint-disable @typescript-eslint/no-explicit-any */
// Type declarations for modules without TypeScript support

declare module 'react-modal' {
  import * as React from 'react';
  
  interface ModalProps {
    isOpen: boolean;
    onRequestClose?: (event: React.MouseEvent | React.KeyboardEvent) => void;
    style?: {
      content?: React.CSSProperties;
      overlay?: React.CSSProperties;
    };
    className?: string;
    overlayClassName?: string;
    bodyOpenClassName?: string;
    htmlOpenClassName?: string;
    ariaHideApp?: boolean;
    shouldFocusAfterRender?: boolean;
    shouldCloseOnOverlayClick?: boolean;
    shouldCloseOnEsc?: boolean;
    shouldReturnFocusAfterClose?: boolean;
    role?: string;
    contentLabel?: string;
    aria?: { [key: string]: string };
    data?: { [key: string]: string };
    children?: React.ReactNode;
  }
  
  export default class Modal extends React.Component<ModalProps> {
    static setAppElement(element: string | HTMLElement): void;
  }
}

declare module 'typewriter-effect' {
  import React from 'react';
  interface TypewriterProps {
    options?: any;
    onInit?: (typewriter: any) => void;
  }
  const Typewriter: React.FC<TypewriterProps>;
  export default Typewriter;
}

// AWS Amplify modules
declare module 'aws-amplify' {
  export const Amplify: {
    configure: (config: any) => void;
  };
}

declare module 'aws-amplify/auth' {
  export function signIn(params: any): Promise<any>;
  export function signUp(params: any): Promise<any>;
  export function signOut(params?: any): Promise<any>;
  export function confirmSignUp(params: any): Promise<any>;
  export function confirmSignIn(params: any): Promise<any>;
  export function resendSignUpCode(params: any): Promise<any>;
  export function resetPassword(params: any): Promise<any>;
  export function confirmResetPassword(params: any): Promise<any>;
  export function fetchUserAttributes(): Promise<any>;
  export function updateUserAttributes(params: any): Promise<any>;
  export function confirmUserAttribute(params: any): Promise<any>;
  export function getCurrentUser(): Promise<any>;
  export function fetchAuthSession(): Promise<any>;
  export function updatePassword(params: any): Promise<any>;
  export function deleteUser(): Promise<any>;
  export function autoSignIn(): Promise<any>;
}

declare module 'aws-amplify/storage' {
  export function uploadData(params: any): any;
  export function downloadData(params: any): any;
  export function remove(params: any): Promise<any>;
  export function list(params: any): Promise<any>;
  export function getUrl(params: any): Promise<any>;
  export function copy(params: any): Promise<any>;
}

// GSAP modules
declare module 'gsap' {
  export const gsap: any;
  export default gsap;
}

declare module 'gsap/ScrollTrigger' {
  export const ScrollTrigger: any;
}

declare module '@gsap/react' {
  export function useGSAP(callback: () => void, deps?: any[]): void;
}

// Other utility modules
declare module 'js-sha256' {
  export function sha256(data: string): string;
}

declare module 'uuid' {
  export function v4(): string;
}

declare module 'jwt-decode' {
  export default function jwtDecode<T = any>(token: string): T;
}

declare module 'pdfjs-dist/legacy/build/pdf' {
  export const GlobalWorkerOptions: any;
  export function getDocument(src: any): any;
}

declare module 'pdfjs-dist/build/pdf.worker.entry' {
  const url: string;
  export default url;
}

declare module './app/contexts/AuthContext' {
  interface AuthContextType {
    isAuthenticated: boolean;
    setIsAuthenticated: (value: boolean) => void;
    authStatus: string;
    setAuthStatus: (value: string) => void;
    user: any;
    setUser: (value: any) => void;
    refreshUser: (forceRefresh?: boolean) => Promise<void>;
    validateAndSetUserSession: (label?: string) => Promise<void>;
    getCurrentUser: () => Promise<any>;
    getAuthTokens: () => Promise<any>;
    globalSignOut: () => Promise<void>;
    loading: boolean;
    updateUserCognitoAttributes: (userAttributes: any) => Promise<void>;
  }
  
  export const useAuth: () => AuthContextType;
  export const AuthProvider: React.FC<{ children: React.ReactNode }>;
}

declare module './app/App' {
  import React from 'react';
  const App: React.FC;
  export default App;
}

declare module './app/bootstrapDevErrorHooks' {
  const bootstrapDevErrorHooks: any;
  export default bootstrapDevErrorHooks;
}

declare module 'scramble-text' {
  export default class ScrambleText {
    constructor(element: HTMLElement, options?: any);
    start(): ScrambleText;
    play(): void;
    stop(): void;
  }
}

declare module 'fabric' {
  export class StaticCanvas {
    constructor(element: string | HTMLCanvasElement, options?: any);
    toDataURL(options?: any): string;
    getContext(): CanvasRenderingContext2D;
    clearContext(ctx: CanvasRenderingContext2D): void;
  }

  export class Canvas extends StaticCanvas {
    constructor(element: string | HTMLCanvasElement, options?: any);
    setWidth(width: number): Canvas;
    setHeight(height: number): Canvas;
    add(object: any): Canvas;
    renderAll(): Canvas;
    clear(): Canvas;
    toJSON(): any;
    loadFromJSON(json: any, callback?: () => void): void;
    dispose(): void;
    freeDrawingBrush: any;
    isDrawingMode: boolean;
    selection: boolean;
    on(event: string, handler: (e: any) => void): void;
    off(event: string, handler?: (e: any) => void): void;
    getObjects(): any[];
    remove(...objects: any[]): Canvas;
    getActiveObject(): any;
    discardActiveObject(): Canvas;
    requestRenderAll(): void;
    getZoom(): number;
    zoomToPoint(point: any, value: number): void;
  }
  
  export class PencilBrush {
    constructor(canvas: Canvas);
    color: string;
    width: number;
  }
  
  export class Rect {
    constructor(options?: any);
    static fromObject(object: any): Rect;
  }
  
  export class IText {
    constructor(text: string, options?: any);
    static fromObject(object: any): IText;
  }
  
  export class Image {
    constructor(element: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | string, options?: any);
    static fromURL(url: string, options?: any): Promise<Image>;
    static fromObject(object: any): Image;
  }
}

// Allow importing CSS modules and plain CSS files
declare module '*.module.css' {
  const classes: { [key: string]: string };
  export default classes;
}

declare module '*.css';

declare module '*.json';









