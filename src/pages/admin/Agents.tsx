import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Plus, Trash2, UserPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const agentSchema = z.object({
    email: z.string().email("بريد إلكتروني غير صالح"),
    password: z.string().min(6, "كلمة المرور يجب أن تكون 6 أحرف على الأقل"),
    full_name: z.string().min(2, "الاسم الكامل مطلوب"),
    phone: z.string().min(10, "رقم الهاتف مطلوب"),
});

type AgentRow = Record<string, unknown> & {
    id: string;
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    created_at: string;
    total_orders?: number;
    delivered_orders?: number;
    total_collected?: number;
};

export default function AdminAgents() {
    const [searchTerm, setSearchTerm] = useState("");
    const [open, setOpen] = useState(false);
    const queryClient = useQueryClient();

    const form = useForm<z.infer<typeof agentSchema>>({
        resolver: zodResolver(agentSchema),
        defaultValues: {
            email: "",
            password: "",
            full_name: "",
            phone: "",
        },
    });

    const { data: agents, isLoading } = useQuery({
        queryKey: ["admin-agents"],
        queryFn: () => apiClient.listAdminAgents() as Promise<AgentRow[]>,
    });

    const createAgent = useMutation({
        mutationFn: (values: z.infer<typeof agentSchema>) => apiClient.createAdminAgent(values),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-agents"] });
            toast.success("تم إضافة الوكيل بنجاح");
            setOpen(false);
            form.reset();
        },
        onError: (error: Error) => {
            toast.error(`فشل إضافة الوكيل: ${error.message}`);
        },
    });

    const deleteAgent = useMutation({
        mutationFn: (id: string) => apiClient.revokeAdminAgent(id),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["admin-agents"] });
            if (data.alreadyRevoked) {
                toast.success("المستخدم ليس وكيلاً حالياً (تم التأكيد)");
            } else {
                toast.success("تم إزالة صلاحية الوكيل");
            }
        },
        onError: () => toast.error("حدث خطأ أثناء الحذف"),
    });

    const onSubmit = (values: z.infer<typeof agentSchema>) => {
        createAgent.mutate(values);
    };

    const filteredAgents = agents?.filter((agent) =>
        String(agent.full_name ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(agent.email ?? "").toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative flex-1 max-w-sm w-full">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                    <Input
                        placeholder="بحث عن وكيل (مندوب)..."
                        className="pr-10"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button className="gap-2 w-full md:w-auto">
                            <UserPlus size={18} />
                            إضافة وكيل (مندوب) جديد
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>إضافة وكيل (مندوب) جديد</DialogTitle>
                        </DialogHeader>
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                <FormField
                                    control={form.control}
                                    name="full_name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>الاسم الكامل</FormLabel>
                                            <FormControl>
                                                <Input placeholder="الاسم الكامل" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="email"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>البريد الإلكتروني</FormLabel>
                                            <FormControl>
                                                <Input placeholder="example@domain.com" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="phone"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>رقم الهاتف</FormLabel>
                                            <FormControl>
                                                <Input placeholder="07XXXXXXXX" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="password"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>كلمة المرور</FormLabel>
                                            <FormControl>
                                                <Input type="password" placeholder="******" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <Button type="submit" className="w-full" disabled={createAgent.isPending}>
                                    {createAgent.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                                    إضافة
                                </Button>
                            </form>
                        </Form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="bg-card rounded-lg border border-border overflow-hidden overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="text-right">الاسم</TableHead>
                            <TableHead className="text-right">البريد الإلكتروني</TableHead>
                            <TableHead className="text-right">رقم الهاتف</TableHead>
                            <TableHead className="text-center">إجمالي الطلبات</TableHead>
                            <TableHead className="text-center">تم التوصيل</TableHead>
                            <TableHead className="text-center">إجمالي التحصيل</TableHead>
                            <TableHead className="text-right">تاريخ الانضمام</TableHead>
                            <TableHead className="text-center">إجراءات</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">جاري التحميل...</TableCell>
                            </TableRow>
                        ) : filteredAgents?.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">لا يوجد وكلاء (مناديب) حالياً</TableCell>
                            </TableRow>
                        ) : filteredAgents?.map((agent) => (
                            <TableRow key={agent.id}>
                                <TableCell className="font-medium">{agent.full_name || "غير محدد"}</TableCell>
                                <TableCell>{agent.email}</TableCell>
                                <TableCell dir="ltr" className="text-right">{agent.phone || "-"}</TableCell>
                                <TableCell className="text-center">
                                    <Badge variant="secondary" className="font-bold">
                                        {agent.total_orders ?? 0}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-center">
                                    <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 font-bold">
                                        {agent.delivered_orders ?? 0}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-center font-bold text-blue-600">
                                    {formatPrice(Number(agent.total_collected ?? 0))}
                                </TableCell>
                                <TableCell>{new Date(agent.created_at).toLocaleDateString('ar-EG')}</TableCell>
                                <TableCell className="text-center">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-destructive hover:text-destructive"
                                        onClick={() => {
                                            if (confirm("هل أنت متأكد من إزالة صلاحية هذا الوكيل؟")) {
                                                deleteAgent.mutate(agent.id);
                                            }
                                        }}
                                    >
                                        <Trash2 size={18} />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
