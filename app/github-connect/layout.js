/* eslint-disable @next/next/no-page-custom-font */
export const metadata = {
    title: "Connect GitHub - HackstreetBoys Portal",
};

export default function GithubConnectLayout({ children }) {
    return (
        <>
            <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet" />
            {children}
        </>
    );
}
