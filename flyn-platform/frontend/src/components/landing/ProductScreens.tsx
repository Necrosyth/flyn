import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Screen {
  id: string;
  title: string;
  description: string;
}

export const ProductScreens = () => {
  const [activeIndex, setActiveIndex] = useState(0);

  const screens: Screen[] = [
    { 
      id: "inbox", 
      title: "Unified Inbox", 
      description: "Inbox live priority" 
    },
    { 
      id: "analytics", 
      title: "Analytics Dashboard", 
      description: "Target & Coaching predict grabs" 
    },
    { 
      id: "events", 
      title: "Events Manager", 
      description: "Event scheduling & RSVPs" 
    },
    { 
      id: "church", 
      title: "Church Admin", 
      description: "Member & group management" 
    },
    { 
      id: "billing", 
      title: "Billing & Usage", 
      description: "Revenue tracking" 
    },
  ];

  const nextSlide = () => {
    setActiveIndex((prev) => (prev + 1) % screens.length);
  };

  const prevSlide = () => {
    setActiveIndex((prev) => (prev - 1 + screens.length) % screens.length);
  };

  return (
    <section className="py-20 lg:py-32 bg-muted/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground">
            Live Product Screens
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            See exactly what you'll get with FLYN AI
          </p>
        </motion.div>

        <div className="relative">
          {/* Carousel */}
          <div className="flex items-center gap-6 justify-center">
            <Button
              variant="outline"
              size="icon"
              onClick={prevSlide}
              className="shrink-0 rounded-full hidden md:flex"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>

            <div className="flex-1 max-w-5xl overflow-hidden">
              <div className="flex gap-6 justify-center">
                <AnimatePresence mode="wait">
                  {[0, 1].map((offset) => {
                    const index = (activeIndex + offset) % screens.length;
                    const screen = screens[index];
                    const isActive = offset === 0;

                    return (
                      <motion.div
                        key={`${screen.id}-${offset}`}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ 
                          opacity: isActive ? 1 : 0.6, 
                          scale: isActive ? 1 : 0.95 
                        }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.3 }}
                        className={`relative bg-card rounded-2xl border border-border shadow-xl overflow-hidden ${
                          isActive ? "flex-1 max-w-xl" : "hidden lg:block flex-1 max-w-md"
                        }`}
                      >
                        {/* Browser Header */}
                        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
                          <div className="flex gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-destructive/60" />
                            <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                            <div className="w-3 h-3 rounded-full bg-green-500/60" />
                          </div>
                          <div className="flex-1 flex justify-center">
                            <div className="px-3 py-1 bg-background rounded text-xs text-muted-foreground flex items-center gap-2">
                              <div className="w-4 h-4 rounded bg-primary/20" />
                              FLYN.AI
                            </div>
                          </div>
                        </div>

                        {/* Screen Content Placeholder */}
                        <div className="aspect-[4/3] bg-gradient-to-br from-muted/50 to-muted p-6">
                          <div className="h-full flex flex-col">
                            {/* Header row */}
                            <div className="flex items-center justify-between mb-4">
                              <div className="h-6 w-32 bg-foreground/10 rounded" />
                              <div className="flex gap-2">
                                <div className="h-8 w-20 bg-primary/20 rounded" />
                                <div className="h-8 w-8 bg-muted rounded" />
                              </div>
                            </div>

                            {/* Stats row */}
                            <div className="grid grid-cols-4 gap-3 mb-4">
                              {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="bg-background/80 rounded-lg p-3">
                                  <div className="h-3 w-12 bg-foreground/10 rounded mb-2" />
                                  <div className="h-5 w-16 bg-foreground/20 rounded" />
                                </div>
                              ))}
                            </div>

                            {/* Main content */}
                            <div className="flex-1 grid grid-cols-3 gap-3">
                              <div className="col-span-2 bg-background/80 rounded-lg p-4">
                                <div className="space-y-2">
                                  {[1, 2, 3, 4].map((i) => (
                                    <div key={i} className="flex items-center gap-2">
                                      <div className="w-8 h-8 rounded-full bg-primary/20" />
                                      <div className="flex-1">
                                        <div className="h-3 w-24 bg-foreground/10 rounded" />
                                        <div className="h-2 w-32 bg-foreground/5 rounded mt-1" />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="bg-background/80 rounded-lg p-4">
                                <div className="h-full flex flex-col justify-end">
                                  <div className="flex items-end gap-1">
                                    {[40, 65, 45, 80, 55].map((h, i) => (
                                      <div
                                        key={i}
                                        className="flex-1 bg-gradient-to-t from-primary to-accent rounded-t"
                                        style={{ height: `${h}%` }}
                                      />
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>

            <Button
              variant="outline"
              size="icon"
              onClick={nextSlide}
              className="shrink-0 rounded-full hidden md:flex"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>

          {/* Labels */}
          <div className="flex justify-center items-center gap-8 mt-6 text-sm text-muted-foreground">
            <span>{screens[activeIndex].title}</span>
            <span className="text-border">•</span>
            <span>{screens[activeIndex].description}</span>
          </div>

          {/* Dots */}
          <div className="flex justify-center gap-2 mt-4">
            {screens.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveIndex(i)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === activeIndex ? "bg-primary" : "bg-border"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
