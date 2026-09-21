import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Textarea } from '@student/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { MapPin, Phone, Mail, Clock, Send } from 'lucide-react';
import ChatButton from '@student/components/ChatButton';
import WhatsAppButton from '@student/components/WhatsAppButton';

const ContactSection = () => {
  return (
    <section className="py-20 bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4">
            Get in Touch with <span className="gradient-text">Fly Masters</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Ready to start your study abroad journey? Our expert counselors are here to guide you every step of the way.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 items-start">
          {/* Contact Information */}
          <div className="space-y-8">
            <div>
              <h3 className="text-2xl font-semibold mb-6">Contact Information</h3>
              
              <div className="space-y-6">
                <Card className="bg-card/50 backdrop-blur-sm">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                        <Phone className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-semibold">Phone Numbers</h4>
                        <div className="text-muted-foreground">
                          <p>+91 9502127788</p>
                          <p>+91 9849908829</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-card/50 backdrop-blur-sm">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                        <Mail className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-semibold">Email Addresses</h4>
                        <div className="text-muted-foreground">
                          <p>rajesh@flymasters.in</p>
                          <p>krishna@flymasters.in</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-card/50 backdrop-blur-sm">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                        <MapPin className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-semibold">Office Location</h4>
                        <p className="text-muted-foreground">
                          Kompally Branch, Hyderabad<br />
                          Telangana, India
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-card/50 backdrop-blur-sm">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                        <Clock className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-semibold">Office Hours</h4>
                        <div className="text-muted-foreground">
                          <p>Monday - Friday: 9:00 AM - 7:00 PM</p>
                          <p>Saturday: 10:00 AM - 5:00 PM</p>
                          <p>Sunday: Closed</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="space-y-4">
              <h3 className="text-xl font-semibold">Quick Actions</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ChatButton />
                
                <Button variant="outline" size="lg" className="group bg-green-500 hover:bg-green-600 text-white border-green-600" asChild>
                  <WhatsAppButton variant="inline" />
                </Button>
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <Card className="bg-card/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="w-5 h-5" />
                Send us a Message
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Full Name *</label>
                  <Input placeholder="Your full name" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Phone Number *</label>
                  <Input placeholder="+91 9876543210" />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Email Address *</label>
                <Input type="email" placeholder="your.email@example.com" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Interested Country</label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="usa">United States</SelectItem>
                      <SelectItem value="canada">Canada</SelectItem>
                      <SelectItem value="uk">United Kingdom</SelectItem>
                      <SelectItem value="australia">Australia</SelectItem>
                      <SelectItem value="germany">Germany</SelectItem>
                      <SelectItem value="france">France</SelectItem>
                      <SelectItem value="netherlands">Netherlands</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Study Level</label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bachelors">Bachelor's</SelectItem>
                      <SelectItem value="masters">Master's</SelectItem>
                      <SelectItem value="phd">PhD</SelectItem>
                      <SelectItem value="diploma">Diploma</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Message</label>
                <Textarea 
                  placeholder="Tell us about your study abroad goals, preferred courses, budget, or any specific questions you have..."
                  rows={4}
                />
              </div>

              <Button size="lg" className="w-full">
                <Send className="w-5 h-5 mr-2" />
                Send Message
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                * Required fields. We'll get back to you within 24 hours.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Study Sessions Info */}
        <div className="mt-16">
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-8">
              <div className="text-center mb-8">
                <h3 className="text-2xl font-semibold mb-2">Weekly Study Sessions</h3>
                <p className="text-muted-foreground">Join our free weekly sessions to learn about study abroad opportunities</p>
              </div>
              
              <div className="grid md:grid-cols-2 gap-8">
                <div className="text-center">
                  <div className="bg-white rounded-lg p-6 shadow-sm">
                    <h4 className="font-semibold text-lg mb-2">Beginner Sessions</h4>
                    <div className="text-primary font-medium mb-2">Mondays 12:00 PM - 02:00 PM</div>
                    <p className="text-sm text-muted-foreground">Perfect for first-time applicants. Learn basics of studying abroad.</p>
                  </div>
                </div>
                
                <div className="text-center">
                  <div className="bg-white rounded-lg p-6 shadow-sm">
                    <h4 className="font-semibold text-lg mb-2">Advanced Sessions</h4>
                    <div className="text-primary font-medium mb-2">Thursdays 01:00 PM - 03:00 PM</div>
                    <p className="text-sm text-muted-foreground">Advanced topics like scholarships, visa applications, and more.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
};

export default ContactSection;