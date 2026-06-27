import * as React from 'react';
import { View, Text, FlatList, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { log, MAX_APP_LOG_ENTRIES } from '@/log';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { Item } from '@/components/Item';
import * as Clipboard from 'expo-clipboard';
import { Modal } from '@/modal';

export default function LogsScreen() {
    const [logs, setLogs] = React.useState<string[]>([]);
    const flatListRef = React.useRef<FlatList>(null);

    // Subscribe to log changes
    React.useEffect(() => {
        // Add some sample logs if empty (for demo purposes)
        if (log.getCount() === 0) {
            log.log('日志系统已初始化');
            log.log('示例调试消息');
            log.log('应用已成功启动');
        }

        // Initial load
        setLogs(log.getLogs());

        // Subscribe to changes
        const unsubscribe = log.onChange(() => {
            setLogs(log.getLogs());
        });

        return unsubscribe;
    }, []);

    // Auto-scroll to bottom when new logs arrive
    React.useEffect(() => {
        if (logs.length > 0) {
            setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: false });
            }, 100);
        }
    }, [logs.length]);

    const handleClear = async () => {
        const confirmed = await Modal.confirm(
            '清除日志',
            '确定要清除所有日志吗？',
            { confirmText: '清除', destructive: true }
        );
        if (confirmed) {
            log.clear();
        }
    };

    const handleCopyAll = async () => {
        if (logs.length === 0) {
            Modal.alert('没有日志', '没有可复制的日志');
            return;
        }

        const allLogs = logs.join('\n');
        await Clipboard.setStringAsync(allLogs);
        Modal.alert('已复制', `${logs.length} 条日志已复制到剪贴板`);
    };

    const handleAddTestLog = () => {
        const timestamp = new Date().toLocaleTimeString();
        log.log(`测试日志条目：${timestamp}`);
    };

    const renderLogItem = ({ item, index }: { item: string; index: number }) => (
        <View style={{
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderBottomWidth: 1,
            borderBottomColor: '#F0F0F0'
        }}>
            <Text style={{
                fontFamily: 'IBMPlexMono-Regular',
                fontSize: 12,
                color: '#333',
                lineHeight: 16
            }}>
                {item}
            </Text>
        </View>
    );

    return (
        <View style={{ flex: 1, backgroundColor: '#F5F5F5' }}>
            {/* Header with actions */}
            <ItemList>
                <ItemGroup
                    title={`日志 (${logs.length})`}
                    footer={`日志仅保存在本地，最多保留 ${MAX_APP_LOG_ENTRIES.toLocaleString()} 条。最旧的日志会优先删除。`}
                >
                    <Item 
                        title="添加测试日志"
                        subtitle="添加一条带时间戳的测试日志"
                        icon={<Ionicons name="add-circle-outline" size={24} color="#34C759" />}
                        onPress={handleAddTestLog}
                    />
                    <Item 
                        title="复制所有日志"
                        icon={<Ionicons name="copy-outline" size={24} color="#007AFF" />}
                        onPress={handleCopyAll}
                        disabled={logs.length === 0}
                    />
                    <Item 
                        title="清除所有日志"
                        icon={<Ionicons name="trash-outline" size={24} color="#FF3B30" />}
                        onPress={handleClear}
                        disabled={logs.length === 0}
                        destructive={true}
                    />
                </ItemGroup>
            </ItemList>

            {/* Logs display */}
            <View style={{ flex: 1, backgroundColor: '#FFFFFF', margin: 16, borderRadius: 8 }}>
                {logs.length === 0 ? (
                    <View style={{
                        flex: 1,
                        justifyContent: 'center',
                        alignItems: 'center',
                        padding: 32
                    }}>
                        <Ionicons name="document-text-outline" size={48} color="#C0C0C0" />
                        <Text style={{
                            fontSize: 16,
                            color: '#999',
                            marginTop: 16,
                            textAlign: 'center'
                        }}>
                            暂无日志
                        </Text>
                        <Text style={{
                            fontSize: 14,
                            color: '#C0C0C0',
                            marginTop: 8,
                            textAlign: 'center'
                        }}>
                            生成日志后会显示在这里
                        </Text>
                    </View>
                ) : (
                    <FlatList
                        ref={flatListRef}
                        data={logs}
                        renderItem={renderLogItem}
                        keyExtractor={(item, index) => index.toString()}
                        style={{ flex: 1 }}
                        contentContainerStyle={{ paddingVertical: 8 }}
                        showsVerticalScrollIndicator={true}
                    />
                )}
            </View>
        </View>
    );
}
