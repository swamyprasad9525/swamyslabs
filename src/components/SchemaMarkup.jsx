import { Helmet } from 'react-helmet-async';

const SITE_URL = 'https://swamyslabs.vercel.app';

export default function SchemaMarkup() {
    const organizationSchema = {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: 'Swamy Slabs',
        url: SITE_URL,
        logo: {
            '@type': 'ImageObject',
            url: `${SITE_URL}/ssi_logo.png`,
        },
        description: 'Natural stone selection, shaping, cutting, polishing, honing, tumbling and calibration for architectural and project requirements.',
        contactPoint: {
            '@type': 'ContactPoint',
            telephone: '+919381260584',
            contactType: 'sales',
            email: 'kolliswami784@gmail.com',
        },
        hasOfferCatalog: {
            '@type': 'OfferCatalog',
            name: 'Natural Stone Gallery',
            url: `${SITE_URL}/stones`,
        },
        knowsAbout: [
            'Natural stone',
            'Limestone',
            'Sandstone',
            'Stone shaping',
            'Stone cutting',
            'Stone polishing',
            'Stone honing',
            'Stone tumbling',
            'Stone calibration',
        ],
    };

    return (
        <Helmet>
            <script type="application/ld+json">{JSON.stringify(organizationSchema)}</script>
        </Helmet>
    );
}
