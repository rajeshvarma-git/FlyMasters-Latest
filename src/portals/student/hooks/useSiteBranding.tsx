import { useState, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';

interface SiteBranding {
  siteName: string;
  siteDescription: string;
  logoUrl: string;
}

export const useSiteBranding = () => {
  const [branding, setBranding] = useState<SiteBranding>({
    siteName: 'Fly Masters',
    siteDescription: 'AI based University & Course selection platform.',
    logoUrl: '/icon-192.png'
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBranding();
  }, []);

  const fetchBranding = async () => {
    try {
      const { data, error } = await supabase
        .from('website_content')
        .select('title, subtitle, image_url')
        .eq('section_key', 'site_branding')
        .eq('is_active', true)
        .single();

      if (!error && data) {
        setBranding({
          siteName: data.title || 'Fly Masters',
          siteDescription: data.subtitle || 'AI based University & Course selection platform.',
          logoUrl: data.image_url || '/icon-192.png'
        });
      }
    } catch (error) {
      console.error('Error fetching site branding:', error);
    } finally {
      setLoading(false);
    }
  };

  return { branding, loading };
};
