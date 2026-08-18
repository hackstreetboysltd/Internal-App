function SkeletonCard() {
    return (
        <div className="skel-member-card">
            <div className="skel-member-header">
                <div className="skel-avatar"></div>
                <div className="skel-member-info">
                    <span className="skel-line w70"></span>
                    <span className="skel-line sm w50"></span>
                </div>
            </div>
            <div className="skel-member-bio">
                <span className="skel-line w100"></span>
                <span className="skel-line w80"></span>
            </div>
            <div className="skel-member-footer">
                <span className="skel-pill"></span>
                <span className="skel-line sm w40"></span>
            </div>
        </div>
    );
}

export default function ProfileFallback() {
    return (
        <div className="profile-module">
            <div className="profile-skeleton" aria-busy="true" aria-label="Loading profile">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                    <SkeletonCard key={i} />
                ))}
            </div>
        </div>
    );
}
