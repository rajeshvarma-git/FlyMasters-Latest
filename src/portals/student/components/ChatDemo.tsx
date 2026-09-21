import { useState, useEffect } from "react";
import { Bot, User, Send } from "lucide-react";
import { Button } from "@student/components/ui/button";
import { Link } from "react-router-dom";
import chatDemoImage from "@student/assets/chat-demo.jpg";
import { useChatNavigation } from "@student/hooks/useChatNavigation";
import { CHAT_PATH } from "@student/lib/auth-utils";

const ChatDemo = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const { requireAuthForChat } = useChatNavigation();
  
  const conversation = [
    { type: 'ai', message: "Hi! I'm your AI university advisor. Where would you like to study?" },
    { type: 'user', message: "I want to study in the USA" },
    { type: 'ai', message: "Great choice! What is your highest educational qualification?" },
    { type: 'user', message: "I have a Bachelor's degree in Engineering" },
    { type: 'ai', message: "Perfect! You may be eligible for courses like MS in Computer Science, Data Science, or Mechanical Engineering. What's your estimated budget?" },
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentStep((prev) => (prev + 1) % (conversation.length + 1));
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="py-20 relative overflow-hidden">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">
            Experience Our <span className="gradient-text">AI Assistant</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            See how our intelligent system guides you through personalized recommendations
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Chat Interface */}
          <div className="glass-card p-8 max-w-lg mx-auto">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/20">
              <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold">AI University Advisor</h3>
                <div className="text-sm text-muted-foreground flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  Online
                </div>
              </div>
            </div>

            <div className="space-y-4 h-64 overflow-hidden">
              {conversation.slice(0, currentStep).map((msg, index) => (
                <div 
                  key={index} 
                  className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={msg.type === 'ai' ? 'chat-bubble-ai' : 'chat-bubble-user'}>
                    <div className="flex items-start gap-2">
                      {msg.type === 'ai' && <Bot className="w-4 h-4 mt-1 flex-shrink-0" />}
                      {msg.type === 'user' && <User className="w-4 h-4 mt-1 flex-shrink-0" />}
                      <p className="text-sm leading-relaxed">{msg.message}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-white/20">
              <div className="flex gap-2">
                <div className="flex-1 bg-white/10 rounded-full px-4 py-2 text-sm">
                  Type your message...
                </div>
                <Button variant="hero" size="icon" className="rounded-full">
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Demo Visual */}
          <div className="relative">
            <div className="glass-card p-6">
              <img 
                src={chatDemoImage} 
                alt="Chat interface demonstration"
                className="w-full h-auto rounded-lg"
              />
            </div>
            
            <Link to={CHAT_PATH} onClick={requireAuthForChat} className="absolute -top-4 -right-4 bg-gradient-primary text-white px-4 py-2 rounded-full text-sm font-semibold shadow-hover hover:scale-105 transition-transform">
              Try it now!
            </Link>
          </div>
        </div>

        <div className="text-center mt-12">
          <Button variant="premium" size="xl" className="group" asChild>
            <Link to={CHAT_PATH} onClick={requireAuthForChat}>
              Start Your AI Consultation
              <Bot className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
};

export default ChatDemo;