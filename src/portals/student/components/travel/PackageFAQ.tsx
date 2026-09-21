import { useQuery } from '@tanstack/react-query';
import { supabase } from '@student/integrations/supabase/client';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@student/components/ui/accordion';
import { Card } from '@student/components/ui/card';
import { HelpCircle } from 'lucide-react';

interface PackageFAQProps {
  packageId: string;
}

export default function PackageFAQ({ packageId }: PackageFAQProps) {
  const { data: faqs, isLoading } = useQuery({
    queryKey: ['package-faqs', packageId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('package_faqs')
        .select('*')
        .eq('package_id', packageId)
        .eq('is_active', true)
        .order('display_order');
      
      if (error) throw error;
      return data;
    },
  });

  if (isLoading || !faqs || faqs.length === 0) return null;

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-6">
        <HelpCircle className="w-5 h-5" />
        <h3 className="text-2xl font-bold">Frequently Asked Questions</h3>
      </div>

      <Accordion type="single" collapsible className="w-full">
        {faqs.map((faq, index) => (
          <AccordionItem key={faq.id} value={`item-${index}`}>
            <AccordionTrigger className="text-left">{faq.question}</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              {faq.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Card>
  );
}
