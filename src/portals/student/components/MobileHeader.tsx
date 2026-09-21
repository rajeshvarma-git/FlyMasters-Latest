import { useState } from 'react';
import { useAuth } from '@student/hooks/useAuth';
import { Button } from '@student/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@student/components/ui/sheet';
import { Avatar, AvatarFallback } from '@student/components/ui/avatar';
import { Menu, GraduationCap, LogOut, User } from 'lucide-react';
import { NavLink } from 'react-router-dom';

export function MobileHeader() {
  const { user, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    setIsOpen(false);
  };

  const userInitials = user?.email?.[0].toUpperCase() || 'U';

  return (
    <header className="fixed top-0 left-0 right-0 z-50 w-full bg-white/95 backdrop-blur-lg border-b border-border/20 md:hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 max-w-full overflow-hidden">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg">FlyMasters</span>
        </div>

        {/* Menu Button */}
        {user && (
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="p-2">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            
            <SheetContent side="right" className="w-80 bg-gradient-background">
              <SheetHeader className="text-left">
                <SheetTitle className="flex items-center gap-3">
                  <Avatar className="w-10 h-10">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{user?.email?.split('@')[0]}</p>
                    <p className="text-sm text-muted-foreground">{user?.email}</p>
                  </div>
                </SheetTitle>
              </SheetHeader>

              <div className="mt-8 space-y-4">
                <NavLink
                  to="/dashboard"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <User className="w-5 h-5" />
                  <span>Dashboard</span>
                </NavLink>

                <NavLink
                  to="/dashboard/documents"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <GraduationCap className="w-5 h-5" />
                  <span>Documents</span>
                </NavLink>

                <div className="border-t border-border/20 pt-4">
                  <Button
                    variant="ghost"
                    onClick={handleSignOut}
                    className="w-full justify-start gap-3 text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <LogOut className="w-5 h-5" />
                    <span>Sign Out</span>
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        )}

        {!user && (
          <NavLink to="/auth">
            <Button size="sm">Sign In</Button>
          </NavLink>
        )}
      </div>
    </header>
  );
}