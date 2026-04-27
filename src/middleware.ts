// src/middleware.ts                                                                  
  import { NextRequest, NextResponse } from "next/server";                              
  
  export function middleware(req: NextRequest) {                                        
    const isInternalDeploy = process.env.NEXT_PUBLIC_APP_MODE === "internal";
    const role = req.cookies.get("anchor-role")?.value;                                 
                                                                                        
    // Let auth pages through always                                                    
    const path = req.nextUrl.pathname;                                                  
    if (path === "/" || path === "/signup" || path.startsWith("/api")) {                
      return NextResponse.next();
    }                                                                                   
                                                            
    if (isInternalDeploy && role === "external_rep") {                                  
      return NextResponse.redirect(new URL("/", req.url));
    }                                                                                   
                                                            
    if (!isInternalDeploy && (role === "admin" || role === "anchor_rep")) {             
      return NextResponse.redirect(new URL("/", req.url));
    }                                                                                   
                                                            
    return NextResponse.next();                                                         
  }
                                                                                        
  export const config = {                                   
    matcher: ["/((?!_next|favicon.ico|.*\\.png|.*\\.svg).*)"],
  }; 