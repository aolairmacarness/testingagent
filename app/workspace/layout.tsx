import WorkspaceHeader from '@/components/custom/WorkspaceHeader';
import { UserDetailProvider } from '@/context/UserDetailContext';
import React from 'react'

function WorkspaceLayout({ children }: {
    children: React.ReactNode;
}) {
    return (
        <UserDetailProvider>
            <div className='mx-auto'>
                <WorkspaceHeader />
                {children}
            </div>
        </UserDetailProvider>
    )
}

export default WorkspaceLayout
