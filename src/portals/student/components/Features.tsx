import { Brain, Globe, Shield, Zap, MessageCircle, TrendingUp } from "lucide-react";
const Features = () => {
  const features = [{
    icon: Brain,
    title: "AI-Powered Matching",
    description: "Advanced algorithms analyze your profile, preferences, and goals to find perfect university matches.",
    gradient: "from-blue-500 to-purple-600"
  }, {
    icon: Globe,
    title: "Global Network",
    description: "Access to 500+ partner universities across 25+ countries with verified programs and rankings.",
    gradient: "from-cyan-500 to-blue-500"
  }, {
    icon: MessageCircle,
    title: "Interactive Chat",
    description: "Conversational AI that understands your needs and guides you through the selection process.",
    gradient: "from-green-500 to-cyan-500"
  }, {
    icon: Shield,
    title: "Verified Information",
    description: "All university data is verified and updated regularly to ensure accuracy and reliability.",
    gradient: "from-purple-500 to-pink-500"
  }, {
    icon: Zap,
    title: "Instant Results",
    description: "Get personalized recommendations in minutes, not weeks. Fast-track your application process.",
    gradient: "from-orange-500 to-red-500"
  }, {
    icon: TrendingUp,
    title: "Success Tracking",
    description: "Monitor your application progress and get insights to improve your chances of admission.",
    gradient: "from-indigo-500 to-purple-500"
  }];
  return <section className="py-20 relative">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">
            Why Choose <span className="gradient-text">Fly Masters</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Our platform combines cutting-edge AI technology with comprehensive university data to simplify your study abroad journey.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => <div key={index} className="glass-card p-8 group cursor-pointer">
              <div className={`w-12 h-12 rounded-full bg-gradient-to-r ${feature.gradient} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                <feature.icon className="w-6 h-6 text-white" />
              </div>
              
              <h3 className="text-xl font-semibold mb-4">{feature.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
              
              <div className={`h-1 w-0 bg-gradient-to-r ${feature.gradient} mt-4 group-hover:w-full transition-all duration-500`} />
            </div>)}
        </div>
      </div>
    </section>;
};
export default Features;