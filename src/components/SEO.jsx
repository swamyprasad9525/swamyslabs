import React from 'react';
import { Helmet } from 'react-helmet-async';

const SITE_URL = 'https://swamyslabs.vercel.app';
const DEFAULT_OG_IMAGE = `${SITE_URL}/ssi_logo.png`;

const SEO = ({ title, description, keywords, canonicalUrl, ogImage, noIndex = false }) => {
    const fullTitle = title?.includes('Swamy Slabs') ? title : `${title} | Swamy Slabs`;
    const canonical = canonicalUrl || SITE_URL;
    const imageUrl = ogImage || DEFAULT_OG_IMAGE;

    return (
        <Helmet>
            <title>{fullTitle}</title>
            <meta name="description" content={description} />
            {keywords && <meta name="keywords" content={keywords} />}
            <meta name="robots" content={noIndex ? 'noindex, nofollow' : 'index, follow'} />
            <link rel="canonical" href={canonical} />

            {/* Open Graph / Facebook */}
            <meta property="og:type" content="website" />
            <meta property="og:site_name" content="Swamy Slabs" />
            <meta property="og:url" content={canonical} />
            <meta property="og:title" content={fullTitle} />
            <meta property="og:description" content={description} />
            <meta property="og:image" content={imageUrl} />
            <meta property="og:image:alt" content="Swamy Slabs - Premium Natural Stone" />
            <meta property="og:locale" content="en_IN" />

            {/* Twitter Card */}
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={fullTitle} />
            <meta name="twitter:description" content={description} />
            <meta name="twitter:image" content={imageUrl} />
        </Helmet>
    );
};

export default SEO;
