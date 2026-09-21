import React from 'react';
import { Helmet } from 'react-helmet-async';

interface SEOHeadProps {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  url?: string;
  type?: string;
}

const SEOHead: React.FC<SEOHeadProps> = ({
  title = 'Fly Masters - AI-Powered Study Abroad & University Selection',
  description = 'Your trusted study abroad consultant. AI-powered university matching, visa assistance, scholarships, and application support. 50,000+ students placed in top universities worldwide.',
  keywords = 'study abroad, university admission, visa assistance, scholarships, education consultant, AI university matching, international education, study overseas, masters abroad, FlyMasters',
  image = '/icon-512.png',
  url = window.location.href,
  type = 'website'
}) => {
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      
      {/* Open Graph */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={type} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image} />
      
      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
      
      {/* Canonical URL */}
      <link rel="canonical" href={url} />
      
      {/* Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "EducationalOrganization",
          "name": "Fly Masters",
          "description": description,
          "url": url,
          "logo": image,
          "contactPoint": {
            "@type": "ContactPoint",
            "telephone": "+91-9502127788",
            "contactType": "customer service",
            "availableLanguage": ["en", "hi", "te"]
          },
          "address": {
            "@type": "PostalAddress",
            "addressLocality": "Hyderabad",
            "addressCountry": "IN"
          },
          "sameAs": [
            "https://www.linkedin.com/company/flymasters",
            "https://www.facebook.com/flymasters",
            "https://www.instagram.com/flymasters"
          ]
        })}
      </script>
    </Helmet>
  );
};

export default SEOHead;