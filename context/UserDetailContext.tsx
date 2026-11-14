"use client";

import axios from "axios";
import { createContext, useEffect, useState, type ReactNode } from "react";

export const UserDetailContext = createContext<any>({
    userDetail: null,
    setUserDetail: () => {},
});

export function UserDetailProvider({ children }: { children: ReactNode }) {
    const [userDetail, setUserDetail] = useState<any>(null);

    useEffect(() => {
        axios.post("/api/user").then((res) => {
            setUserDetail(res.data.user ?? null);
        }).catch((e) => {
            console.log("Error loading user: ", e);
        });
    }, []);

    return (
        <UserDetailContext.Provider value={{ userDetail, setUserDetail }}>
            {children}
        </UserDetailContext.Provider>
    );
}
