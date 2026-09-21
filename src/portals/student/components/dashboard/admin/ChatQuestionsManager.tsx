import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Label } from '@student/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@student/components/ui/select';
import { Switch } from '@student/components/ui/switch';
import { useToast } from '@student/hooks/use-toast';
import { supabase } from '@student/integrations/supabase/client';
import { GripVertical, Plus, Trash2, Save } from 'lucide-react';

interface ChatQuestion {
  id: string;
  question_text: string;
  question_type: string;
  display_order: number;
  is_required: boolean;
  is_active: boolean;
}

const ChatQuestionsManager: React.FC = () => {
  const [questions, setQuestions] = useState<ChatQuestion[]>([]);
  const [newQuestion, setNewQuestion] = useState({
    question_text: '',
    question_type: 'custom',
    is_required: true,
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    const { data, error } = await supabase
      .from('chat_questions')
      .select('*')
      .order('display_order');
    
    if (error) {
      toast({
        title: "Error",
        description: "Failed to fetch questions",
        variant: "destructive",
      });
      return;
    }
    setQuestions(data || []);
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    const items = Array.from(questions);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // Update display_order
    const updatedItems = items.map((item, index) => ({
      ...item,
      display_order: index,
    }));

    setQuestions(updatedItems);

    // Save to database - update each individually
    for (const item of updatedItems) {
      await supabase
        .from('chat_questions')
        .update({ display_order: item.display_order })
        .eq('id', item.id);
    }

    toast({
      title: "Success",
      description: "Question order updated",
    });
  };

  const addQuestion = async () => {
    if (!newQuestion.question_text) {
      toast({
        title: "Error",
        description: "Please enter a question",
        variant: "destructive",
      });
      return;
    }

    const { error } = await supabase
      .from('chat_questions')
      .insert({
        ...newQuestion,
        display_order: questions.length,
      });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to add question",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Success",
      description: "Question added successfully",
    });

    setNewQuestion({
      question_text: '',
      question_type: 'custom',
      is_required: true,
    });
    fetchQuestions();
  };

  const deleteQuestion = async (id: string) => {
    const { error } = await supabase
      .from('chat_questions')
      .delete()
      .eq('id', id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to delete question",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Success",
      description: "Question deleted",
    });
    fetchQuestions();
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    const { error } = await supabase
      .from('chat_questions')
      .update({ is_active: !isActive })
      .eq('id', id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update question",
        variant: "destructive",
      });
      return;
    }

    fetchQuestions();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Add New Question</CardTitle>
          <CardDescription>Create a new question for the chat flow</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Question Text</Label>
            <Input
              value={newQuestion.question_text}
              onChange={(e) => setNewQuestion({ ...newQuestion, question_text: e.target.value })}
              placeholder="What is your preferred country?"
            />
          </div>
          
          <div>
            <Label>Question Type</Label>
            <Select
              value={newQuestion.question_type}
              onValueChange={(value) => setNewQuestion({ ...newQuestion, question_type: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="country">Country</SelectItem>
                <SelectItem value="qualification">Qualification</SelectItem>
                <SelectItem value="stream">Stream</SelectItem>
                <SelectItem value="score">Academic Score</SelectItem>
                <SelectItem value="budget">Budget</SelectItem>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="phone">Phone</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              checked={newQuestion.is_required}
              onCheckedChange={(checked) => setNewQuestion({ ...newQuestion, is_required: checked })}
            />
            <Label>Required Question</Label>
          </div>

          <Button onClick={addQuestion} className="w-full">
            <Plus className="w-4 h-4 mr-2" />
            Add Question
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manage Questions</CardTitle>
          <CardDescription>Drag and drop to reorder questions</CardDescription>
        </CardHeader>
        <CardContent>
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="questions">
              {(provided) => (
                <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                  {questions.map((question, index) => (
                    <Draggable key={question.id} draggableId={question.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`
                            flex items-center gap-3 p-4 bg-card border rounded-lg
                            ${snapshot.isDragging ? 'shadow-lg scale-105' : ''}
                            transition-all
                          `}
                        >
                          <div {...provided.dragHandleProps}>
                            <GripVertical className="w-5 h-5 text-muted-foreground cursor-grab" />
                          </div>
                          
                          <div className="flex-1">
                            <p className="font-medium">{question.question_text}</p>
                            <p className="text-sm text-muted-foreground">
                              Type: {question.question_type} • {question.is_required ? 'Required' : 'Optional'}
                            </p>
                          </div>

                          <Switch
                            checked={question.is_active}
                            onCheckedChange={() => toggleActive(question.id, question.is_active)}
                          />

                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteQuestion(question.id)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </CardContent>
      </Card>
    </div>
  );
};

export default ChatQuestionsManager;