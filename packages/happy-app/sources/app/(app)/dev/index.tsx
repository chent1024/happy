import * as React from 'react';
import { ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { useLocalSettingMutable, useSocketStatus } from '@/sync/storage';
import { Modal } from '@/modal';
import { sync } from '@/sync/sync';
import { getServerUrl, setServerUrl, validateServerUrl, getLogServerUrl, setLogServerUrl } from '@/sync/serverConfig';
import { Switch } from '@/components/Switch';
import { useUnistyles } from 'react-native-unistyles';
import { setLastViewedTitle } from '@/changelog';

export default function DevScreen() {
    const router = useRouter();
    const [debugMode, setDebugMode] = useLocalSettingMutable('debugMode');
    const [verboseLogging, setVerboseLogging] = useLocalSettingMutable('verboseLogging');
    const [consoleLoggingEnabled, setConsoleLoggingEnabled] = useLocalSettingMutable('consoleLoggingEnabled');
    const socketStatus = useSocketStatus();
    const anonymousId = sync.encryption!.anonID;
    const { theme } = useUnistyles();

    const handleEditServerUrl = async () => {
        const currentUrl = getServerUrl();

        const newUrl = await Modal.prompt(
            '编辑 API 端点',
            '请输入服务器 URL：',
            {
                defaultValue: currentUrl,
                confirmText: '保存'
            }
        );

        if (newUrl && newUrl !== currentUrl) {
            const validation = validateServerUrl(newUrl);
            if (validation.valid) {
                setServerUrl(newUrl);
                Modal.alert('成功', '服务器 URL 已更新。请重启应用以使更改生效。');
            } else {
                Modal.alert('URL 无效', validation.error || '请输入有效的 URL');
            }
        }
    };

    const handleEditLogServerUrl = async () => {
        const currentUrl = getLogServerUrl() || '';

        const newUrl = await Modal.prompt(
            '远程日志服务器',
            '会通过 HTTP 将所有控制台输出以未加密明文发送到此 URL。请使用 Mac 的局域网 IP（例如 http://192.168.1.5:8787），并在 Mac 上运行 "yarn app-logs" 接收日志。清空可禁用。',
            {
                defaultValue: currentUrl,
                confirmText: '保存'
            }
        );

        if (newUrl !== undefined && newUrl !== currentUrl) {
            if (!newUrl || !newUrl.trim()) {
                setLogServerUrl(null);
                Modal.alert('成功', '远程日志已禁用。请重启应用以使更改生效。');
            } else {
                const validation = validateServerUrl(newUrl);
                if (validation.valid) {
                    setLogServerUrl(newUrl);
                    Modal.alert('成功', '日志服务器 URL 已更新。请重启应用以使更改生效。');
                } else {
                    Modal.alert('URL 无效', validation.error || '请输入有效的 URL');
                }
            }
        }
    };

    const handleClearCache = async () => {
        const confirmed = await Modal.confirm(
            '清除缓存',
            '确定要清除所有缓存数据吗？',
            { confirmText: '清除', destructive: true }
        );
        if (confirmed) {
            console.log('缓存已清除');
            Modal.alert('成功', '缓存已清除');
        }
    };

    // Helper function to format time ago
    const formatTimeAgo = (timestamp: number | null): string => {
        if (!timestamp) return '';

        const now = Date.now();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (seconds < 10) return '刚刚';
        if (seconds < 60) return `${seconds} 秒前`;
        if (minutes < 60) return `${minutes} 分钟前`;
        if (hours < 24) return `${hours} 小时前`;
        if (days < 7) return `${days} 天前`;

        return new Date(timestamp).toLocaleDateString();
    };

    // Helper function to get socket status subtitle
    const getSocketStatusSubtitle = (): string => {
        const { status, lastConnectedAt, lastDisconnectedAt } = socketStatus;

        if (status === 'connected' && lastConnectedAt) {
            return `已连接，${formatTimeAgo(lastConnectedAt)}`;
        } else if ((status === 'disconnected' || status === 'error') && lastDisconnectedAt) {
            return `上次连接于 ${formatTimeAgo(lastDisconnectedAt)}`;
        } else if (status === 'connecting') {
            return '正在连接服务器...';
        }

        return '无连接信息';
    };

    const getSocketStatusDetail = (): string => {
        switch (socketStatus.status) {
            case 'connected':
                return '已连接';
            case 'connecting':
                return '连接中';
            case 'error':
                return '错误';
            case 'disconnected':
                return '已断开';
            default:
                return '未知';
        }
    };

    // Socket status indicator component
    const SocketStatusIndicator = () => {
        switch (socketStatus.status) {
            case 'connected':
                return <Ionicons name="checkmark-circle" size={22} color="#34C759" />;
            case 'connecting':
                return <ActivityIndicator size="small" color={theme.colors.textSecondary} />;
            case 'error':
                return <Ionicons name="close-circle" size={22} color="#FF3B30" />;
            case 'disconnected':
                return <Ionicons name="close-circle" size={22} color="#FF9500" />;
            default:
                return <Ionicons name="help-circle" size={22} color="#8E8E93" />;
        }
    };

    return (
        <ItemList>
            {/* 应用信息 */}
            <ItemGroup title="应用信息">
                <Item
                    title="版本"
                    detail={Constants.expoConfig?.version || '1.0.0'}
                />
                <Item
                    title="构建号"
                    detail={Application.nativeBuildVersion || '不可用'}
                />
                <Item
                    title="SDK 版本"
                    detail={Constants.expoConfig?.sdkVersion || '未知'}
                />
                <Item
                    title="平台"
                    detail={`${Constants.platform?.ios ? 'iOS' : 'Android'} ${Constants.systemVersion || ''}`}
                />
                <Item
                    title="匿名 ID"
                    detail={anonymousId}
                />
            </ItemGroup>

            {/* 调试选项 */}
            <ItemGroup title="调试选项">
                <Item
                    title="调试模式"
                    rightElement={
                        <Switch
                            value={debugMode}
                            onValueChange={setDebugMode}
                        />
                    }
                    showChevron={false}
                />
                <Item
                    title="控制台输出"
                    subtitle="在生产构建中启用控制台输出"
                    rightElement={
                        <Switch
                            value={consoleLoggingEnabled}
                            onValueChange={setConsoleLoggingEnabled}
                        />
                    }
                    showChevron={false}
                />
                <Item
                    title="详细日志"
                    subtitle="记录所有网络请求和响应"
                    rightElement={
                        <Switch
                            value={verboseLogging}
                            onValueChange={setVerboseLogging}
                        />
                    }
                    showChevron={false}
                />
                <Item
                    title="查看日志"
                    icon={<Ionicons name="document-text-outline" size={28} color="#007AFF" />}
                    onPress={() => router.push('/dev/logs')}
                />
            </ItemGroup>

            {/* 组件演示 */}
            <ItemGroup title="组件演示">
                <Item
                    title="设备信息"
                    subtitle="安全区域和设备参数"
                    icon={<Ionicons name="phone-portrait-outline" size={28} color="#007AFF" />}
                    onPress={() => router.push('/dev/device-info')}
                />
                <Item
                    title="列表组件"
                    subtitle="Item、ItemGroup 和 ItemList 演示"
                    icon={<Ionicons name="list-outline" size={28} color="#007AFF" />}
                    onPress={() => router.push('/dev/list-demo')}
                />
                <Item
                    title="字体排版"
                    subtitle="全部排版样式"
                    icon={<Ionicons name="text-outline" size={28} color="#007AFF" />}
                    onPress={() => router.push('/dev/typography')}
                />
                <Item
                    title="颜色"
                    subtitle="调色板和主题"
                    icon={<Ionicons name="color-palette-outline" size={28} color="#007AFF" />}
                    onPress={() => router.push('/dev/colors')}
                />
                <Item
                    title="消息演示"
                    subtitle="各种消息类型和组件"
                    icon={<Ionicons name="chatbubbles-outline" size={28} color="#007AFF" />}
                    onPress={() => router.push('/dev/messages-demo')}
                />
                <Item
                    title="反向列表测试"
                    subtitle="测试键盘场景下的反向 FlatList"
                    icon={<Ionicons name="swap-vertical-outline" size={28} color="#007AFF" />}
                    onPress={() => router.push('/dev/inverted-list')}
                />
                <Item
                    title="工具视图"
                    subtitle="工具调用可视化组件"
                    icon={<Ionicons name="construct-outline" size={28} color="#007AFF" />}
                    onPress={() => router.push('/dev/tools2')}
                />
                <Item
                    title="闪光加载视图"
                    subtitle="带遮罩的闪光加载效果"
                    icon={<Ionicons name="sparkles-outline" size={28} color="#007AFF" />}
                    onPress={() => router.push('/dev/shimmer-demo')}
                />
                <Item
                    title="多行文本输入"
                    subtitle="自动增长的多行文本输入"
                    icon={<Ionicons name="create-outline" size={28} color="#007AFF" />}
                    onPress={() => router.push('/dev/multi-text-input')}
                />
                <Item
                    title="输入框样式"
                    subtitle="10+ 种输入框样式变体"
                    icon={<Ionicons name="color-palette-outline" size={28} color="#007AFF" />}
                    onPress={() => router.push('/dev/input-styles')}
                />
                <Item
                    title="弹窗系统"
                    subtitle="提示、确认和自定义弹窗"
                    icon={<Ionicons name="albums-outline" size={28} color="#007AFF" />}
                    onPress={() => router.push('/dev/modal-demo')}
                />
                <Item
                    title="单元测试"
                    subtitle="在应用环境中运行测试"
                    icon={<Ionicons name="flask-outline" size={28} color="#34C759" />}
                    onPress={() => router.push('/dev/tests')}
                />
                <Item
                    title="Unistyles 演示"
                    subtitle="React Native Unistyles 功能演示"
                    icon={<Ionicons name="brush-outline" size={28} color="#FF6B6B" />}
                    onPress={() => router.push('/dev/unistyles-demo')}
                />
                <Item
                    title="二维码测试"
                    subtitle="测试不同参数下的二维码生成"
                    icon={<Ionicons name="qr-code-outline" size={28} color="#007AFF" />}
                    onPress={() => router.push('/dev/qr-test')}
                />
                <Item
                    title="会话编辑器"
                    subtitle="新建会话页面布局"
                    icon={<Ionicons name="add-circle-outline" size={28} color="#007AFF" />}
                    onPress={() => router.push('/dev/session-composer' as any)}
                />
            </ItemGroup>

            {/* 测试功能 */}
            <ItemGroup title="测试功能" footer="这些操作可能影响应用稳定性">
                <Item
                    title="Claude OAuth 测试"
                    subtitle="测试 Claude 认证流程"
                    icon={<Ionicons name="key-outline" size={28} color="#007AFF" />}
                    onPress={() => router.push('/settings/connect/claude')}
                />
                <Item
                    title="崩溃测试"
                    subtitle="触发一次测试崩溃"
                    destructive={true}
                    icon={<Ionicons name="warning-outline" size={28} color="#FF3B30" />}
                    onPress={async () => {
                        const confirmed = await Modal.confirm(
                            '崩溃测试',
                            '这会导致应用崩溃。是否继续？',
                            { confirmText: '崩溃', destructive: true }
                        );
                        if (confirmed) {
                            throw new Error('从开发者菜单触发的测试崩溃');
                        }
                    }}
                />
                <Item
                    title="清除缓存"
                    subtitle="移除所有缓存数据"
                    icon={<Ionicons name="trash-outline" size={28} color="#FF9500" />}
                    onPress={handleClearCache}
                />
                <Item
                    title="重置更新日志"
                    subtitle="再次显示“新功能”横幅"
                    icon={<Ionicons name="sparkles-outline" size={28} color="#007AFF" />}
                    onPress={() => {
                        setLastViewedTitle('');
                        Modal.alert('完成', '更新日志已重置。重启应用后会显示横幅。');
                    }}
                />
                <Item
                    title="重置应用状态"
                    subtitle="清除所有用户数据和偏好设置"
                    destructive={true}
                    icon={<Ionicons name="refresh-outline" size={28} color="#FF3B30" />}
                    onPress={async () => {
                        const confirmed = await Modal.confirm(
                            '重置应用',
                            '这会删除所有数据。确定要继续吗？',
                            { confirmText: '重置', destructive: true }
                        );
                        if (confirmed) {
                            console.log('应用状态已重置');
                        }
                    }}
                />
            </ItemGroup>

            {/* 系统 */}
            <ItemGroup title="系统">
                <Item
                    title="购买"
                    subtitle="查看订阅和权益"
                    icon={<Ionicons name="card-outline" size={28} color="#007AFF" />}
                    onPress={() => router.push('/dev/purchases')}
                />
                <Item
                    title="Expo 常量"
                    subtitle="查看 expoConfig、manifest 和系统常量"
                    icon={<Ionicons name="information-circle-outline" size={28} color="#007AFF" />}
                    onPress={() => router.push('/dev/expo-constants')}
                />
            </ItemGroup>

            {/* 网络 */}
            <ItemGroup title="网络">
                <Item
                    title="API 端点"
                    detail={getServerUrl()}
                    onPress={handleEditServerUrl}
                    detailStyle={{ flex: 1, textAlign: 'right', minWidth: '70%' }}
                />
                <Item
                    title="日志服务器"
                    subtitle="通过 HTTP 发送未加密控制台日志"
                    detail={getLogServerUrl() || '关闭'}
                    onPress={handleEditLogServerUrl}
                    detailStyle={{ flex: 1, textAlign: 'right', minWidth: '50%' }}
                />
                <Item
                    title="Socket.IO 状态"
                    subtitle={getSocketStatusSubtitle()}
                    detail={getSocketStatusDetail()}
                    rightElement={<SocketStatusIndicator />}
                    showChevron={false}
                />
            </ItemGroup>
        </ItemList>
    );
}
